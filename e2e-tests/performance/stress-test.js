const { TestHelper } = require('../src/test-utils');
const MockAxisCameraServer = require('../mocks/axis-camera-server');
const MockCloudOrchestrator = require('../mocks/cloud-orchestrator');
const { performance } = require('perf_hooks');

describe('Performance and Stress Tests', () => {
  let cameraServer;
  let orchestrator;
  let testHelper;

  const CAMERA_CONFIG = {
    id: 'ACCC8EF85A3C',
    ip: 'localhost',
    port: 8080,
    model: 'AXIS P3245-V'
  };

  const ORCHESTRATOR_CONFIG = {
    baseUrl: 'http://localhost:3000',
    wsUrl: 'ws://localhost:3001'
  };

  beforeAll(async () => {
    // Start mock servers
    cameraServer = new MockAxisCameraServer({
      port: CAMERA_CONFIG.port,
      wsPort: 8081,
      cameraId: CAMERA_CONFIG.id,
      model: CAMERA_CONFIG.model
    });

    orchestrator = new MockCloudOrchestrator({
      port: 3000,
      wsPort: 3001
    });

    await cameraServer.start();
    await orchestrator.start();

    // Initialize test helper
    testHelper = new TestHelper(CAMERA_CONFIG, ORCHESTRATOR_CONFIG);

    // Register camera once
    await testHelper.registerCamera();

    // Wait for servers to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    if (testHelper) {
      await testHelper.cleanup();
    }
    if (cameraServer) {
      await cameraServer.stop();
    }
    if (orchestrator) {
      await orchestrator.stop();
    }
  });

  describe('Session Management Performance', () => {
    test('should handle high session creation rate', async () => {
      const sessionCount = 50;
      const batchSize = 10;
      const results = {
        totalSessions: 0,
        successfulSessions: 0,
        failedSessions: 0,
        avgCreationTime: 0,
        maxCreationTime: 0,
        minCreationTime: Infinity
      };

      console.log(`Creating ${sessionCount} sessions in batches of ${batchSize}...`);

      for (let batch = 0; batch < sessionCount / batchSize; batch++) {
        const batchPromises = [];
        const batchStart = performance.now();

        // Create batch of sessions
        for (let i = 0; i < batchSize; i++) {
          const sessionPromise = testHelper.createSession(CAMERA_CONFIG.id, 'live')
            .then(session => {
              results.successfulSessions++;
              return session;
            })
            .catch(error => {
              results.failedSessions++;
              console.error(`Session creation failed:`, error.message);
              return null;
            });
          
          batchPromises.push(sessionPromise);
        }

        await Promise.all(batchPromises);
        results.totalSessions += batchSize;

        const batchTime = performance.now() - batchStart;
        const avgBatchTime = batchTime / batchSize;
        
        results.avgCreationTime = (results.avgCreationTime * batch + avgBatchTime) / (batch + 1);
        results.maxCreationTime = Math.max(results.maxCreationTime, avgBatchTime);
        results.minCreationTime = Math.min(results.minCreationTime, avgBatchTime);

        console.log(`Batch ${batch + 1}/${sessionCount / batchSize} completed in ${batchTime.toFixed(2)}ms`);

        // Brief pause between batches
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log('Session Creation Performance Results:');
      console.log(`Total Sessions: ${results.totalSessions}`);
      console.log(`Successful: ${results.successfulSessions} (${(results.successfulSessions / results.totalSessions * 100).toFixed(1)}%)`);
      console.log(`Failed: ${results.failedSessions} (${(results.failedSessions / results.totalSessions * 100).toFixed(1)}%)`);
      console.log(`Average Creation Time: ${results.avgCreationTime.toFixed(2)}ms`);
      console.log(`Min Creation Time: ${results.minCreationTime.toFixed(2)}ms`);
      console.log(`Max Creation Time: ${results.maxCreationTime.toFixed(2)}ms`);

      // Performance expectations
      expect(results.successfulSessions).toBeGreaterThan(results.totalSessions * 0.8); // 80% success rate
      expect(results.avgCreationTime).toBeLessThan(1000); // Average under 1 second
    });

    test('should handle concurrent WebRTC negotiations', async () => {
      const concurrentSessions = 20;
      const webrtcResults = {
        successful: 0,
        failed: 0,
        avgNegotiationTime: 0,
        negotiations: []
      };

      console.log(`Testing ${concurrentSessions} concurrent WebRTC negotiations...`);

      // Create sessions first
      const sessionPromises = [];
      for (let i = 0; i < concurrentSessions; i++) {
        sessionPromises.push(testHelper.createSession(CAMERA_CONFIG.id, 'live'));
      }
      const sessions = (await Promise.all(sessionPromises)).filter(s => s !== null);

      console.log(`Created ${sessions.length} sessions, starting WebRTC negotiations...`);

      // Perform concurrent WebRTC negotiations
      const webrtcPromises = sessions.map(async (session, index) => {
        const start = performance.now();
        try {
          const answer = await testHelper.testWebRTCOffer(session.id);
          const negotiationTime = performance.now() - start;
          
          webrtcResults.negotiations.push(negotiationTime);
          webrtcResults.successful++;
          
          return { success: true, time: negotiationTime, session: session.id };
        } catch (error) {
          const negotiationTime = performance.now() - start;
          webrtcResults.failed++;
          console.error(`WebRTC negotiation ${index} failed:`, error.message);
          return { success: false, time: negotiationTime, session: session.id };
        }
      });

      const webrtcNegotiations = await Promise.all(webrtcPromises);

      if (webrtcResults.negotiations.length > 0) {
        webrtcResults.avgNegotiationTime = webrtcResults.negotiations.reduce((sum, time) => sum + time, 0) / webrtcResults.negotiations.length;
      }

      const maxNegotiationTime = Math.max(...webrtcResults.negotiations);
      const minNegotiationTime = Math.min(...webrtcResults.negotiations);

      console.log('WebRTC Performance Results:');
      console.log(`Successful Negotiations: ${webrtcResults.successful}`);
      console.log(`Failed Negotiations: ${webrtcResults.failed}`);
      console.log(`Success Rate: ${(webrtcResults.successful / (webrtcResults.successful + webrtcResults.failed) * 100).toFixed(1)}%`);
      console.log(`Average Negotiation Time: ${webrtcResults.avgNegotiationTime.toFixed(2)}ms`);
      console.log(`Min Negotiation Time: ${minNegotiationTime.toFixed(2)}ms`);
      console.log(`Max Negotiation Time: ${maxNegotiationTime.toFixed(2)}ms`);

      expect(webrtcResults.successful).toBeGreaterThan(concurrentSessions * 0.7); // 70% success rate
      expect(webrtcResults.avgNegotiationTime).toBeLessThan(2000); // Under 2 seconds average
    });
  });

  describe('WebSocket Performance', () => {
    test('should handle high message throughput', async () => {
      const session = await testHelper.createSession(CAMERA_CONFIG.id);
      const ws = await testHelper.connectWebSocket(session.id);

      const messageCount = 1000;
      const messageResults = {
        sent: 0,
        received: 0,
        avgLatency: 0,
        latencies: []
      };

      console.log(`Testing WebSocket with ${messageCount} messages...`);

      // Set up message listener
      let receivedCount = 0;
      testHelper.on('ws_message', (data) => {
        receivedCount++;
        const messageData = data.message;
        if (messageData.type === 'ping_response' && messageData.timestamp) {
          const latency = Date.now() - messageData.timestamp;
          messageResults.latencies.push(latency);
        }
      });

      const startTime = performance.now();

      // Send messages rapidly
      for (let i = 0; i < messageCount; i++) {
        const success = testHelper.sendMessage(session.id, {
          type: 'ping',
          id: i,
          timestamp: Date.now()
        });
        
        if (success) {
          messageResults.sent++;
        }

        // Small delay to prevent overwhelming
        if (i % 100 === 0) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }

      const sendTime = performance.now() - startTime;

      // Wait for responses
      await new Promise(resolve => setTimeout(resolve, 2000));

      messageResults.received = receivedCount;
      if (messageResults.latencies.length > 0) {
        messageResults.avgLatency = messageResults.latencies.reduce((sum, l) => sum + l, 0) / messageResults.latencies.length;
      }

      console.log('WebSocket Throughput Results:');
      console.log(`Messages Sent: ${messageResults.sent}`);
      console.log(`Messages Received: ${messageResults.received}`);
      console.log(`Send Rate: ${(messageResults.sent / (sendTime / 1000)).toFixed(2)} msg/sec`);
      console.log(`Average Latency: ${messageResults.avgLatency.toFixed(2)}ms`);

      ws.close();

      expect(messageResults.sent).toBe(messageCount);
      expect(messageResults.sent / (sendTime / 1000)).toBeGreaterThan(100); // At least 100 msg/sec
    });

    test('should handle multiple concurrent WebSocket connections', async () => {
      const connectionCount = 25;
      const connections = [];
      const connectionResults = {
        successful: 0,
        failed: 0,
        avgConnectTime: 0,
        connectTimes: []
      };

      console.log(`Testing ${connectionCount} concurrent WebSocket connections...`);

      // Create sessions for connections
      const sessionPromises = [];
      for (let i = 0; i < connectionCount; i++) {
        sessionPromises.push(testHelper.createSession(CAMERA_CONFIG.id, 'live'));
      }
      const sessions = (await Promise.all(sessionPromises)).filter(s => s !== null);

      // Connect WebSockets concurrently
      const connectionPromises = sessions.map(async (session, index) => {
        const start = performance.now();
        try {
          const ws = await testHelper.connectWebSocket(session.id);
          const connectTime = performance.now() - start;
          
          connectionResults.connectTimes.push(connectTime);
          connectionResults.successful++;
          connections.push(ws);
          
          return { success: true, time: connectTime, session: session.id };
        } catch (error) {
          connectionResults.failed++;
          console.error(`WebSocket connection ${index} failed:`, error.message);
          return { success: false, session: session.id };
        }
      });

      await Promise.all(connectionPromises);

      if (connectionResults.connectTimes.length > 0) {
        connectionResults.avgConnectTime = connectionResults.connectTimes.reduce((sum, time) => sum + time, 0) / connectionResults.connectTimes.length;
      }

      // Test message sending on all connections
      let messagesSent = 0;
      connections.forEach((ws, index) => {
        if (ws.readyState === 1) { // OPEN
          const success = testHelper.sendMessage(sessions[index].id, {
            type: 'test',
            data: `Test message from connection ${index}`
          });
          if (success) messagesSent++;
        }
      });

      console.log('Concurrent WebSocket Results:');
      console.log(`Successful Connections: ${connectionResults.successful}`);
      console.log(`Failed Connections: ${connectionResults.failed}`);
      console.log(`Success Rate: ${(connectionResults.successful / connectionCount * 100).toFixed(1)}%`);
      console.log(`Average Connect Time: ${connectionResults.avgConnectTime.toFixed(2)}ms`);
      console.log(`Messages Sent to All Connections: ${messagesSent}`);

      // Cleanup connections
      connections.forEach(ws => {
        if (ws.readyState === 1) {
          ws.close();
        }
      });

      expect(connectionResults.successful).toBeGreaterThan(connectionCount * 0.8); // 80% success rate
      expect(connectionResults.avgConnectTime).toBeLessThan(1000); // Under 1 second
    });
  });

  describe('PTZ Performance Under Load', () => {
    test('should handle rapid PTZ commands', async () => {
      const commandCount = 100;
      const ptzResults = {
        successful: 0,
        failed: 0,
        avgResponseTime: 0,
        responseTimes: []
      };

      console.log(`Testing ${commandCount} rapid PTZ commands...`);

      for (let i = 0; i < commandCount; i++) {
        const start = performance.now();
        const pan = (Math.random() - 0.5) * 180; // -90 to 90
        const tilt = (Math.random() - 0.5) * 90; // -45 to 45
        const zoom = Math.random() * 2 + 1; // 1 to 3

        try {
          const success = await testHelper.testDirectPTZ(pan, tilt, zoom);
          const responseTime = performance.now() - start;
          
          if (success) {
            ptzResults.successful++;
            ptzResults.responseTimes.push(responseTime);
          } else {
            ptzResults.failed++;
          }
        } catch (error) {
          ptzResults.failed++;
          console.error(`PTZ command ${i} failed:`, error.message);
        }

        // Small delay to prevent overwhelming
        if (i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      if (ptzResults.responseTimes.length > 0) {
        ptzResults.avgResponseTime = ptzResults.responseTimes.reduce((sum, time) => sum + time, 0) / ptzResults.responseTimes.length;
      }

      const maxResponseTime = Math.max(...ptzResults.responseTimes);
      const minResponseTime = Math.min(...ptzResults.responseTimes);

      console.log('PTZ Performance Results:');
      console.log(`Successful Commands: ${ptzResults.successful}`);
      console.log(`Failed Commands: ${ptzResults.failed}`);
      console.log(`Success Rate: ${(ptzResults.successful / commandCount * 100).toFixed(1)}%`);
      console.log(`Average Response Time: ${ptzResults.avgResponseTime.toFixed(2)}ms`);
      console.log(`Min Response Time: ${minResponseTime.toFixed(2)}ms`);
      console.log(`Max Response Time: ${maxResponseTime.toFixed(2)}ms`);

      expect(ptzResults.successful).toBeGreaterThan(commandCount * 0.9); // 90% success rate
      expect(ptzResults.avgResponseTime).toBeLessThan(500); // Under 500ms average
    });
  });

  describe('Memory and Resource Usage', () => {
    test('should monitor memory usage during high load', async () => {
      const iterations = 20;
      const memorySnapshots = [];

      console.log(`Monitoring memory usage over ${iterations} iterations...`);

      for (let i = 0; i < iterations; i++) {
        // Take memory snapshot
        const memUsage = process.memoryUsage();
        memorySnapshots.push({
          iteration: i,
          rss: memUsage.rss,
          heapUsed: memUsage.heapUsed,
          heapTotal: memUsage.heapTotal,
          external: memUsage.external
        });

        // Perform load operations
        const session = await testHelper.createSession(CAMERA_CONFIG.id);
        const ws = await testHelper.connectWebSocket(session.id);
        await testHelper.testWebRTCOffer(session.id);
        
        // Send multiple messages
        for (let j = 0; j < 10; j++) {
          testHelper.sendMessage(session.id, {
            type: 'test',
            data: `Load test iteration ${i}, message ${j}`
          });
        }

        ws.close();

        if (i % 5 === 0) {
          console.log(`Iteration ${i}: RSS=${(memUsage.rss / 1024 / 1024).toFixed(2)}MB, Heap=${(memUsage.heapUsed / 1024 / 1024).toFixed(2)}MB`);
        }

        // Force garbage collection if available
        if (global.gc) {
          global.gc();
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // Analyze memory trends
      const firstSnapshot = memorySnapshots[0];
      const lastSnapshot = memorySnapshots[memorySnapshots.length - 1];
      
      const rssGrowth = ((lastSnapshot.rss - firstSnapshot.rss) / firstSnapshot.rss) * 100;
      const heapGrowth = ((lastSnapshot.heapUsed - firstSnapshot.heapUsed) / firstSnapshot.heapUsed) * 100;

      console.log('Memory Usage Analysis:');
      console.log(`Initial RSS: ${(firstSnapshot.rss / 1024 / 1024).toFixed(2)}MB`);
      console.log(`Final RSS: ${(lastSnapshot.rss / 1024 / 1024).toFixed(2)}MB`);
      console.log(`RSS Growth: ${rssGrowth.toFixed(2)}%`);
      console.log(`Heap Growth: ${heapGrowth.toFixed(2)}%`);

      // Memory shouldn't grow excessively
      expect(rssGrowth).toBeLessThan(50); // Less than 50% growth
      expect(heapGrowth).toBeLessThan(100); // Less than 100% heap growth
    });
  });

  describe('Error Recovery Performance', () => {
    test('should recover quickly from service interruptions', async () => {
      const recoveryResults = {
        orchestratorRestartTime: 0,
        cameraRestartTime: 0,
        serviceRecoveryTime: 0
      };

      console.log('Testing service recovery performance...');

      // Test orchestrator restart
      const orchRestartStart = performance.now();
      await orchestrator.stop();
      orchestrator = new MockCloudOrchestrator({ port: 3000, wsPort: 3001 });
      await orchestrator.start();
      recoveryResults.orchestratorRestartTime = performance.now() - orchRestartStart;

      // Test camera restart
      const cameraRestartStart = performance.now();
      await cameraServer.stop();
      cameraServer = new MockAxisCameraServer({
        port: CAMERA_CONFIG.port,
        wsPort: 8081,
        cameraId: CAMERA_CONFIG.id,
        model: CAMERA_CONFIG.model
      });
      await cameraServer.start();
      recoveryResults.cameraRestartTime = performance.now() - cameraRestartStart;

      // Test full service recovery
      const serviceRecoveryStart = performance.now();
      await testHelper.registerCamera();
      const session = await testHelper.createSession(CAMERA_CONFIG.id);
      await testHelper.testWebRTCOffer(session.id);
      recoveryResults.serviceRecoveryTime = performance.now() - serviceRecoveryStart;

      console.log('Recovery Performance Results:');
      console.log(`Orchestrator Restart: ${recoveryResults.orchestratorRestartTime.toFixed(2)}ms`);
      console.log(`Camera Restart: ${recoveryResults.cameraRestartTime.toFixed(2)}ms`);
      console.log(`Full Service Recovery: ${recoveryResults.serviceRecoveryTime.toFixed(2)}ms`);

      // Recovery should be reasonably fast
      expect(recoveryResults.orchestratorRestartTime).toBeLessThan(5000); // Under 5 seconds
      expect(recoveryResults.cameraRestartTime).toBeLessThan(3000); // Under 3 seconds
      expect(recoveryResults.serviceRecoveryTime).toBeLessThan(10000); // Under 10 seconds
    });
  });
});