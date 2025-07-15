const express = require('express');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const bodyParser = require('body-parser');

class MockCloudOrchestrator {
  constructor(config = {}) {
    this.port = config.port || 3000;
    this.wsPort = config.wsPort || 3001;
    this.app = express();
    this.wss = null;
    this.clients = new Map();
    this.sessions = new Map();
    this.cameras = new Map();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[Orchestrator] ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // Camera Registration
    this.app.post('/api/cameras/register', (req, res) => {
      const { 
        id, 
        ip, 
        model, 
        capabilities, 
        location,
        metadata 
      } = req.body;
      
      const camera = {
        id,
        ip,
        model,
        capabilities,
        location,
        metadata,
        status: 'online',
        lastSeen: new Date().toISOString(),
        sessionId: null
      };
      
      this.cameras.set(id, camera);
      
      // Notify clients
      this.broadcast('camera_registered', camera);
      
      res.json({
        success: true,
        camera,
        message: 'Camera registered successfully'
      });
    });

    // List Cameras
    this.app.get('/api/cameras', (req, res) => {
      res.json({
        cameras: Array.from(this.cameras.values()),
        total: this.cameras.size
      });
    });

    // Get Camera Details
    this.app.get('/api/cameras/:id', (req, res) => {
      const camera = this.cameras.get(req.params.id);
      if (!camera) {
        return res.status(404).json({ error: 'Camera not found' });
      }
      res.json(camera);
    });

    // Create Session
    this.app.post('/api/sessions', (req, res) => {
      const { cameraId, sessionType = 'live', options = {} } = req.body;
      
      const camera = this.cameras.get(cameraId);
      if (!camera) {
        return res.status(404).json({ error: 'Camera not found' });
      }
      
      const sessionId = uuidv4();
      const session = {
        id: sessionId,
        cameraId,
        sessionType,
        options,
        status: 'initializing',
        createdAt: new Date().toISOString(),
        webrtc: {
          offer: null,
          answer: null,
          candidates: [],
          connectionState: 'new'
        },
        stats: {
          packetsReceived: 0,
          bytesReceived: 0,
          framesReceived: 0,
          lastUpdate: new Date().toISOString()
        }
      };
      
      this.sessions.set(sessionId, session);
      
      // Update camera session
      camera.sessionId = sessionId;
      this.cameras.set(cameraId, camera);
      
      res.json({
        success: true,
        session,
        websocketUrl: `ws://localhost:${this.wsPort}/session/${sessionId}`
      });
    });

    // Get Session
    this.app.get('/api/sessions/:id', (req, res) => {
      const session = this.sessions.get(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(session);
    });

    // WebRTC Signaling
    this.app.post('/api/sessions/:id/offer', (req, res) => {
      const { offer } = req.body;
      const session = this.sessions.get(req.params.id);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      session.webrtc.offer = offer;
      session.status = 'negotiating';
      
      // Generate mock answer
      const answer = {
        type: 'answer',
        sdp: this.generateMockSDP('answer')
      };
      
      session.webrtc.answer = answer;
      session.webrtc.connectionState = 'connected';
      session.status = 'active';
      
      this.sessions.set(session.id, session);
      
      // Notify WebSocket clients
      this.broadcastToSession(session.id, 'webrtc_answer', { answer });
      
      res.json({ success: true, answer });
    });

    // ICE Candidates
    this.app.post('/api/sessions/:id/candidate', (req, res) => {
      const { candidate } = req.body;
      const session = this.sessions.get(req.params.id);
      
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      session.webrtc.candidates.push(candidate);
      this.sessions.set(session.id, session);
      
      // Echo back a mock candidate
      const mockCandidate = {
        candidate: 'candidate:1 1 UDP 2113667326 192.168.1.100 54400 typ host',
        sdpMLineIndex: 0,
        sdpMid: '0'
      };
      
      this.broadcastToSession(session.id, 'ice_candidate', { candidate: mockCandidate });
      
      res.json({ success: true });
    });

    // PTZ Control
    this.app.post('/api/cameras/:id/ptz', (req, res) => {
      const { command, params } = req.body;
      const camera = this.cameras.get(req.params.id);
      
      if (!camera) {
        return res.status(404).json({ error: 'Camera not found' });
      }
      
      // Simulate PTZ command execution
      const result = {
        command,
        params,
        status: 'executed',
        timestamp: new Date().toISOString()
      };
      
      // Notify session if active
      if (camera.sessionId) {
        this.broadcastToSession(camera.sessionId, 'ptz_update', result);
      }
      
      res.json(result);
    });

    // Get System Status
    this.app.get('/api/status', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        connections: {
          websocket: this.clients.size,
          cameras: this.cameras.size,
          sessions: this.sessions.size
        },
        version: '1.0.0'
      });
    });

    // Health Check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok' });
    });
  }

  setupWebSocket() {
    this.wss = new WebSocket.Server({ 
      port: this.wsPort,
      perMessageDeflate: false 
    });
    
    this.wss.on('connection', (ws, req) => {
      const clientId = uuidv4();
      const sessionId = this.extractSessionId(req.url);
      
      this.clients.set(clientId, {
        ws,
        sessionId,
        lastPing: Date.now()
      });
      
      console.log(`[Orchestrator] WebSocket client connected: ${clientId} (session: ${sessionId})`);
      
      // Send welcome message
      ws.send(JSON.stringify({
        type: 'connected',
        clientId,
        sessionId,
        timestamp: new Date().toISOString()
      }));
      
      // Setup ping/pong
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000);
      
      ws.on('pong', () => {
        const client = this.clients.get(clientId);
        if (client) {
          client.lastPing = Date.now();
          this.clients.set(clientId, client);
        }
      });
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleWebSocketMessage(clientId, data);
        } catch (error) {
          console.error('[Orchestrator] Invalid WebSocket message:', error);
        }
      });
      
      ws.on('close', () => {
        clearInterval(pingInterval);
        this.clients.delete(clientId);
        console.log(`[Orchestrator] WebSocket client disconnected: ${clientId}`);
      });
    });
  }

  extractSessionId(url) {
    const match = url.match(/\/session\/([^\/\?]+)/);
    return match ? match[1] : null;
  }

  handleWebSocketMessage(clientId, data) {
    const { type, payload } = data;
    const client = this.clients.get(clientId);
    
    if (!client) return;
    
    switch (type) {
      case 'subscribe':
        // Subscribe to events
        client.subscriptions = payload.events || [];
        this.clients.set(clientId, client);
        break;
        
      case 'ptz_command':
        if (client.sessionId) {
          this.handlePTZCommand(client.sessionId, payload);
        }
        break;
        
      case 'stream_control':
        if (client.sessionId) {
          this.handleStreamControl(client.sessionId, payload);
        }
        break;
        
      case 'get_stats':
        if (client.sessionId) {
          const session = this.sessions.get(client.sessionId);
          if (session) {
            client.ws.send(JSON.stringify({
              type: 'stats',
              data: session.stats
            }));
          }
        }
        break;
    }
  }

  handlePTZCommand(sessionId, payload) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const camera = this.cameras.get(session.cameraId);
    if (!camera) return;
    
    // Simulate PTZ execution
    this.broadcastToSession(sessionId, 'ptz_executed', {
      command: payload.command,
      params: payload.params,
      status: 'success',
      timestamp: new Date().toISOString()
    });
  }

  handleStreamControl(sessionId, payload) {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    
    const { action, params } = payload;
    
    switch (action) {
      case 'start':
        session.status = 'streaming';
        this.startMockStream(sessionId);
        break;
        
      case 'stop':
        session.status = 'stopped';
        this.stopMockStream(sessionId);
        break;
        
      case 'configure':
        Object.assign(session.options, params);
        break;
    }
    
    this.sessions.set(sessionId, session);
    this.broadcastToSession(sessionId, 'stream_status', {
      action,
      status: session.status
    });
  }

  startMockStream(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || session.streamInterval) return;
    
    // Simulate stream statistics
    session.streamInterval = setInterval(() => {
      session.stats.packetsReceived += Math.floor(Math.random() * 100) + 50;
      session.stats.bytesReceived += Math.floor(Math.random() * 10000) + 5000;
      session.stats.framesReceived += 1;
      session.stats.lastUpdate = new Date().toISOString();
      
      this.broadcastToSession(sessionId, 'stream_stats', session.stats);
    }, 1000);
  }

  stopMockStream(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session || !session.streamInterval) return;
    
    clearInterval(session.streamInterval);
    delete session.streamInterval;
  }

  broadcast(type, data) {
    const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    });
  }

  broadcastToSession(sessionId, type, data) {
    const message = JSON.stringify({ 
      type, 
      data, 
      sessionId,
      timestamp: new Date().toISOString() 
    });
    
    this.clients.forEach((client) => {
      if (client.sessionId === sessionId && client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(message);
      }
    });
  }

  generateMockSDP(type) {
    return `v=0
o=- ${Date.now()} 2 IN IP4 127.0.0.1
s=Mock Orchestrator Stream
t=0 0
a=group:BUNDLE 0 1
a=msid-semantic: WMS stream
m=video 9 UDP/TLS/RTP/SAVPF 96 97
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:orch
a=ice-pwd:orchestratorpass123456789
a=fingerprint:sha-256 11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11:11
a=setup:${type === 'offer' ? 'actpass' : 'active'}
a=mid:0
a=sendrecv
a=rtcp-mux
a=rtpmap:96 VP8/90000
a=rtpmap:97 H264/90000
a=fmtp:97 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f`;
  }

  async start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`[Orchestrator] HTTP server listening on port ${this.port}`);
        console.log(`[Orchestrator] WebSocket server listening on port ${this.wsPort}`);
        resolve();
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      // Clear all stream intervals
      this.sessions.forEach((session) => {
        if (session.streamInterval) {
          clearInterval(session.streamInterval);
        }
      });
      
      this.wss.close(() => {
        this.server.close(() => {
          console.log('[Orchestrator] Server stopped');
          resolve();
        });
      });
    });
  }
}

// Start server if run directly
if (require.main === module) {
  const orchestrator = new MockCloudOrchestrator({
    port: process.env.ORCHESTRATOR_PORT || 3000,
    wsPort: process.env.ORCHESTRATOR_WS_PORT || 3001
  });
  
  orchestrator.start().catch(console.error);
  
  process.on('SIGINT', async () => {
    await orchestrator.stop();
    process.exit(0);
  });
}

module.exports = MockCloudOrchestrator;