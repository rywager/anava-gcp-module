const WebSocket = require('ws');
const { EventEmitter } = require('events');

class WebSocketLoadTester extends EventEmitter {
  constructor(config = {}) {
    super();
    this.baseUrl = config.baseUrl || 'ws://localhost:3001';
    this.httpUrl = config.httpUrl || 'http://localhost:3000';
    this.concurrentConnections = config.concurrentConnections || 50;
    this.testDuration = config.testDuration || 60000; // 1 minute
    this.messageInterval = config.messageInterval || 1000; // 1 second
    
    this.connections = new Map();
    this.sessions = new Map();
    this.metrics = {
      connectionsCreated: 0,
      connectionsSuccessful: 0,
      connectionsFailed: 0,
      messagesSent: 0,
      messagesReceived: 0,
      errors: 0,
      latencies: [],
      connectionTimes: []
    };
    
    this.running = false;
  }

  async createSession() {
    try {
      const axios = require('axios');
      const response = await axios.post(`${this.httpUrl}/api/sessions`, {
        cameraId: 'ACCC8EF85A3C',
        sessionType: 'live',
        options: {
          video: true,
          audio: false
        }
      });
      
      if (response.status === 200 && response.data.success) {
        return response.data.session;
      }
      return null;
    } catch (error) {
      console.error('Failed to create session:', error.message);
      return null;
    }
  }

  async createConnection(sessionId) {
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();
    
    try {
      const wsUrl = sessionId ? `${this.baseUrl}/session/${sessionId}` : this.baseUrl;
      const ws = new WebSocket(wsUrl);
      
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.metrics.connectionsFailed++;
          reject(new Error('Connection timeout'));
        }, 10000);

        ws.on('open', () => {
          clearTimeout(timeout);
          const connectionTime = Date.now() - startTime;
          
          this.metrics.connectionsSuccessful++;
          this.metrics.connectionTimes.push(connectionTime);
          
          this.connections.set(connectionId, {
            ws,
            sessionId,
            lastPing: Date.now(),
            messagesSent: 0,
            messagesReceived: 0
          });
          
          this.setupWebSocketHandlers(connectionId, ws);
          resolve(connectionId);
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          this.metrics.connectionsFailed++;
          reject(error);
        });
      });
    } catch (error) {
      this.metrics.connectionsFailed++;
      throw error;
    }
  }

  setupWebSocketHandlers(connectionId, ws) {
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        const connection = this.connections.get(connectionId);
        
        if (connection) {
          connection.messagesReceived++;
          this.metrics.messagesReceived++;
          
          // Calculate latency if this is a ping response
          if (message.type === 'pong' && message.timestamp) {
            const latency = Date.now() - message.timestamp;
            this.metrics.latencies.push(latency);
          }
        }
        
        this.emit('message', { connectionId, message });
      } catch (error) {
        this.metrics.errors++;
      }
    });

    ws.on('close', () => {
      this.connections.delete(connectionId);
      this.emit('disconnect', { connectionId });
    });

    ws.on('error', (error) => {
      this.metrics.errors++;
      this.emit('error', { connectionId, error });
    });
  }

  sendMessage(connectionId, message) {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      connection.ws.send(JSON.stringify(message));
      connection.messagesSent++;
      this.metrics.messagesSent++;
      return true;
    } catch (error) {
      this.metrics.errors++;
      return false;
    }
  }

  async startMessageLoop() {
    while (this.running) {
      const messages = [
        { type: 'ping', timestamp: Date.now() },
        { type: 'ptz_command', payload: { command: 'absolute', params: { pan: Math.random() * 180 - 90, tilt: Math.random() * 90 - 45, zoom: Math.random() * 2 + 1 } } },
        { type: 'stream_control', payload: { action: 'configure', params: { resolution: '640x480', framerate: 15 } } },
        { type: 'get_stats' }
      ];

      for (const [connectionId, connection] of this.connections) {
        if (connection.ws.readyState === WebSocket.OPEN) {
          const randomMessage = messages[Math.floor(Math.random() * messages.length)];
          this.sendMessage(connectionId, randomMessage);
        }
      }

      await new Promise(resolve => setTimeout(resolve, this.messageInterval));
    }
  }

  async runLoadTest() {
    console.log(`Starting WebSocket load test...`);
    console.log(`Target: ${this.baseUrl}`);
    console.log(`Concurrent connections: ${this.concurrentConnections}`);
    console.log(`Test duration: ${this.testDuration}ms`);
    console.log(`Message interval: ${this.messageInterval}ms`);

    this.running = true;
    const startTime = Date.now();

    // Create sessions for some connections
    console.log('Creating sessions...');
    const sessionPromises = [];
    const sessionCount = Math.min(10, this.concurrentConnections); // Create sessions for first 10 connections
    
    for (let i = 0; i < sessionCount; i++) {
      sessionPromises.push(this.createSession());
    }
    
    const sessions = (await Promise.all(sessionPromises)).filter(s => s !== null);
    console.log(`Created ${sessions.length} sessions`);

    // Create connections in batches
    console.log('Creating WebSocket connections...');
    const batchSize = 10;
    const batches = Math.ceil(this.concurrentConnections / batchSize);

    for (let batch = 0; batch < batches; batch++) {
      const batchPromises = [];
      const batchStart = batch * batchSize;
      const batchEnd = Math.min(batchStart + batchSize, this.concurrentConnections);

      for (let i = batchStart; i < batchEnd; i++) {
        this.metrics.connectionsCreated++;
        
        // Use session for some connections
        const sessionId = i < sessions.length ? sessions[i].id : null;
        const connectionPromise = this.createConnection(sessionId).catch(error => {
          console.error(`Connection ${i} failed:`, error.message);
          return null;
        });
        
        batchPromises.push(connectionPromise);
      }

      await Promise.all(batchPromises);
      console.log(`Batch ${batch + 1}/${batches} completed. Active connections: ${this.connections.size}`);

      // Brief pause between batches
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log(`${this.connections.size} connections established`);

    // Start message sending loop
    const messageLoopPromise = this.startMessageLoop();

    // Run test for specified duration
    await new Promise(resolve => setTimeout(resolve, this.testDuration));

    // Stop test
    this.running = false;
    await messageLoopPromise;

    // Close all connections
    console.log('Closing connections...');
    for (const [connectionId, connection] of this.connections) {
      if (connection.ws.readyState === WebSocket.OPEN) {
        connection.ws.close();
      }
    }

    const testDuration = Date.now() - startTime;
    
    // Calculate metrics
    const avgLatency = this.metrics.latencies.length > 0 
      ? this.metrics.latencies.reduce((sum, l) => sum + l, 0) / this.metrics.latencies.length 
      : 0;
    
    const avgConnectionTime = this.metrics.connectionTimes.length > 0
      ? this.metrics.connectionTimes.reduce((sum, t) => sum + t, 0) / this.metrics.connectionTimes.length
      : 0;

    const messageRate = this.metrics.messagesSent / (testDuration / 1000);
    const successRate = (this.metrics.connectionsSuccessful / this.metrics.connectionsCreated) * 100;

    // Print results
    console.log('\n=== WebSocket Load Test Results ===');
    console.log(`Test Duration: ${(testDuration / 1000).toFixed(2)}s`);
    console.log(`Target Connections: ${this.concurrentConnections}`);
    console.log(`Connections Created: ${this.metrics.connectionsCreated}`);
    console.log(`Connections Successful: ${this.metrics.connectionsSuccessful}`);
    console.log(`Connections Failed: ${this.metrics.connectionsFailed}`);
    console.log(`Success Rate: ${successRate.toFixed(2)}%`);
    console.log(`Average Connection Time: ${avgConnectionTime.toFixed(2)}ms`);
    console.log(`Messages Sent: ${this.metrics.messagesSent}`);
    console.log(`Messages Received: ${this.metrics.messagesReceived}`);
    console.log(`Message Rate: ${messageRate.toFixed(2)} msg/sec`);
    console.log(`Average Latency: ${avgLatency.toFixed(2)}ms`);
    console.log(`Errors: ${this.metrics.errors}`);

    if (this.metrics.latencies.length > 0) {
      const sortedLatencies = this.metrics.latencies.sort((a, b) => a - b);
      const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)];
      const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)];
      const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)];
      
      console.log(`Latency P50: ${p50}ms`);
      console.log(`Latency P95: ${p95}ms`);
      console.log(`Latency P99: ${p99}ms`);
    }

    return {
      testDuration,
      metrics: this.metrics,
      avgLatency,
      avgConnectionTime,
      messageRate,
      successRate
    };
  }
}

// Run load test if executed directly
if (require.main === module) {
  const config = {
    baseUrl: process.env.WS_URL || 'ws://localhost:3001',
    httpUrl: process.env.HTTP_URL || 'http://localhost:3000',
    concurrentConnections: parseInt(process.env.CONNECTIONS || '25'),
    testDuration: parseInt(process.env.DURATION || '60000'),
    messageInterval: parseInt(process.env.MESSAGE_INTERVAL || '1000')
  };

  const tester = new WebSocketLoadTester(config);
  
  tester.runLoadTest()
    .then(results => {
      console.log('\nLoad test completed successfully');
      process.exit(0);
    })
    .catch(error => {
      console.error('Load test failed:', error);
      process.exit(1);
    });
}

module.exports = WebSocketLoadTester;