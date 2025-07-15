const { ipcMain } = require('electron');
const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws');

class WebRTCOrchestrator {
  constructor() {
    this.app = express();
    this.httpServer = null;
    this.io = null;
    this.wss = null;
    this.isRunning = false;
    this.port = 8080;
    this.connections = new Map();
    this.rooms = new Map();
    this.setupIPC();
  }

  setupIPC() {
    ipcMain.handle('start-webrtc-orchestrator', async (event, port) => {
      return this.start(port);
    });

    ipcMain.handle('stop-webrtc-orchestrator', async (event) => {
      return this.stop();
    });

    ipcMain.handle('get-webrtc-status', async (event) => {
      return this.getStatus();
    });

    ipcMain.handle('get-webrtc-connections', async (event) => {
      return Array.from(this.connections.values());
    });

    ipcMain.handle('get-webrtc-rooms', async (event) => {
      return Array.from(this.rooms.values());
    });
  }

  async start(port = 8080) {
    if (this.isRunning) {
      throw new Error('WebRTC orchestrator is already running');
    }

    try {
      this.port = port;
      this.setupExpress();
      this.setupSocketIO();
      this.setupWebSocket();
      
      await this.startServer();
      
      this.isRunning = true;
      
      return {
        success: true,
        port: this.port,
        message: 'WebRTC orchestrator started successfully'
      };
    } catch (error) {
      throw new Error(`Failed to start WebRTC orchestrator: ${error.message}`);
    }
  }

  async stop() {
    if (!this.isRunning) {
      return {
        success: true,
        message: 'WebRTC orchestrator was not running'
      };
    }

    try {
      // Close all connections
      this.connections.clear();
      this.rooms.clear();
      
      // Close WebSocket server
      if (this.wss) {
        this.wss.close();
      }
      
      // Close Socket.IO server
      if (this.io) {
        this.io.close();
      }
      
      // Close HTTP server
      if (this.httpServer) {
        await new Promise((resolve) => {
          this.httpServer.close(resolve);
        });
      }
      
      this.isRunning = false;
      
      return {
        success: true,
        message: 'WebRTC orchestrator stopped successfully'
      };
    } catch (error) {
      throw new Error(`Failed to stop WebRTC orchestrator: ${error.message}`);
    }
  }

  setupExpress() {
    this.app.use(express.json());
    this.app.use(express.static('public'));
    
    // CORS middleware
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        connections: this.connections.size,
        rooms: this.rooms.size,
        uptime: process.uptime()
      });
    });

    // WebRTC signaling endpoints
    this.app.post('/api/rooms', (req, res) => {
      const { roomId, peerId } = req.body;
      this.createRoom(roomId, peerId);
      res.json({ success: true, roomId });
    });

    this.app.get('/api/rooms/:roomId', (req, res) => {
      const room = this.rooms.get(req.params.roomId);
      if (room) {
        res.json(room);
      } else {
        res.status(404).json({ error: 'Room not found' });
      }
    });

    this.app.delete('/api/rooms/:roomId', (req, res) => {
      this.rooms.delete(req.params.roomId);
      res.json({ success: true });
    });
  }

  setupSocketIO() {
    this.httpServer = createServer(this.app);
    this.io = new Server(this.httpServer, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.io.on('connection', (socket) => {
      console.log('Socket.IO client connected:', socket.id);
      
      this.connections.set(socket.id, {
        id: socket.id,
        type: 'socket.io',
        connectedAt: new Date().toISOString(),
        roomId: null
      });

      socket.on('join-room', (data) => {
        const { roomId, peerId } = data;
        socket.join(roomId);
        
        const connection = this.connections.get(socket.id);
        if (connection) {
          connection.roomId = roomId;
          connection.peerId = peerId;
        }
        
        // Notify other peers in the room
        socket.to(roomId).emit('peer-joined', { peerId, socketId: socket.id });
        
        console.log(`Peer ${peerId} joined room ${roomId}`);
      });

      socket.on('leave-room', (data) => {
        const { roomId, peerId } = data;
        socket.leave(roomId);
        
        const connection = this.connections.get(socket.id);
        if (connection) {
          connection.roomId = null;
        }
        
        // Notify other peers in the room
        socket.to(roomId).emit('peer-left', { peerId, socketId: socket.id });
        
        console.log(`Peer ${peerId} left room ${roomId}`);
      });

      socket.on('offer', (data) => {
        const { targetPeerId, offer, roomId } = data;
        socket.to(roomId).emit('offer', {
          fromPeerId: this.connections.get(socket.id)?.peerId,
          offer,
          socketId: socket.id
        });
      });

      socket.on('answer', (data) => {
        const { targetPeerId, answer, roomId } = data;
        socket.to(roomId).emit('answer', {
          fromPeerId: this.connections.get(socket.id)?.peerId,
          answer,
          socketId: socket.id
        });
      });

      socket.on('ice-candidate', (data) => {
        const { targetPeerId, candidate, roomId } = data;
        socket.to(roomId).emit('ice-candidate', {
          fromPeerId: this.connections.get(socket.id)?.peerId,
          candidate,
          socketId: socket.id
        });
      });

      socket.on('disconnect', () => {
        console.log('Socket.IO client disconnected:', socket.id);
        this.connections.delete(socket.id);
      });
    });
  }

  setupWebSocket() {
    this.wss = new WebSocket.Server({ port: this.port + 1 });

    this.wss.on('connection', (ws) => {
      const connectionId = this.generateConnectionId();
      console.log('WebSocket client connected:', connectionId);
      
      this.connections.set(connectionId, {
        id: connectionId,
        type: 'websocket',
        connectedAt: new Date().toISOString(),
        ws: ws
      });

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleWebSocketMessage(connectionId, data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      });

      ws.on('close', () => {
        console.log('WebSocket client disconnected:', connectionId);
        this.connections.delete(connectionId);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  handleWebSocketMessage(connectionId, data) {
    const { type, payload } = data;
    
    switch (type) {
      case 'join-room':
        this.handleJoinRoom(connectionId, payload);
        break;
      case 'leave-room':
        this.handleLeaveRoom(connectionId, payload);
        break;
      case 'offer':
        this.handleOffer(connectionId, payload);
        break;
      case 'answer':
        this.handleAnswer(connectionId, payload);
        break;
      case 'ice-candidate':
        this.handleIceCandidate(connectionId, payload);
        break;
      default:
        console.warn('Unknown WebSocket message type:', type);
    }
  }

  handleJoinRoom(connectionId, payload) {
    const { roomId, peerId } = payload;
    const connection = this.connections.get(connectionId);
    
    if (connection) {
      connection.roomId = roomId;
      connection.peerId = peerId;
      
      // Add to room
      if (!this.rooms.has(roomId)) {
        this.rooms.set(roomId, {
          id: roomId,
          peers: new Set(),
          createdAt: new Date().toISOString()
        });
      }
      
      const room = this.rooms.get(roomId);
      room.peers.add(peerId);
      
      // Notify other peers
      this.broadcastToRoom(roomId, {
        type: 'peer-joined',
        payload: { peerId, connectionId }
      }, connectionId);
    }
  }

  handleLeaveRoom(connectionId, payload) {
    const { roomId } = payload;
    const connection = this.connections.get(connectionId);
    
    if (connection && connection.roomId === roomId) {
      const room = this.rooms.get(roomId);
      if (room) {
        room.peers.delete(connection.peerId);
        
        if (room.peers.size === 0) {
          this.rooms.delete(roomId);
        }
      }
      
      connection.roomId = null;
      
      // Notify other peers
      this.broadcastToRoom(roomId, {
        type: 'peer-left',
        payload: { peerId: connection.peerId, connectionId }
      }, connectionId);
    }
  }

  handleOffer(connectionId, payload) {
    const { targetPeerId, offer } = payload;
    const connection = this.connections.get(connectionId);
    
    if (connection) {
      this.sendToPeer(targetPeerId, {
        type: 'offer',
        payload: {
          fromPeerId: connection.peerId,
          offer,
          connectionId
        }
      });
    }
  }

  handleAnswer(connectionId, payload) {
    const { targetPeerId, answer } = payload;
    const connection = this.connections.get(connectionId);
    
    if (connection) {
      this.sendToPeer(targetPeerId, {
        type: 'answer',
        payload: {
          fromPeerId: connection.peerId,
          answer,
          connectionId
        }
      });
    }
  }

  handleIceCandidate(connectionId, payload) {
    const { targetPeerId, candidate } = payload;
    const connection = this.connections.get(connectionId);
    
    if (connection) {
      this.sendToPeer(targetPeerId, {
        type: 'ice-candidate',
        payload: {
          fromPeerId: connection.peerId,
          candidate,
          connectionId
        }
      });
    }
  }

  broadcastToRoom(roomId, message, excludeConnectionId) {
    const room = this.rooms.get(roomId);
    if (!room) return;
    
    for (const [connectionId, connection] of this.connections.entries()) {
      if (connection.roomId === roomId && connectionId !== excludeConnectionId) {
        this.sendMessage(connectionId, message);
      }
    }
  }

  sendToPeer(peerId, message) {
    for (const [connectionId, connection] of this.connections.entries()) {
      if (connection.peerId === peerId) {
        this.sendMessage(connectionId, message);
        break;
      }
    }
  }

  sendMessage(connectionId, message) {
    const connection = this.connections.get(connectionId);
    if (!connection) return;
    
    if (connection.type === 'websocket' && connection.ws) {
      connection.ws.send(JSON.stringify(message));
    }
  }

  createRoom(roomId, peerId) {
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, {
        id: roomId,
        peers: new Set(),
        createdAt: new Date().toISOString()
      });
    }
    
    const room = this.rooms.get(roomId);
    room.peers.add(peerId);
    
    return room;
  }

  generateConnectionId() {
    return Math.random().toString(36).substr(2, 9);
  }

  async startServer() {
    return new Promise((resolve, reject) => {
      this.httpServer.listen(this.port, (error) => {
        if (error) {
          reject(error);
        } else {
          console.log(`WebRTC orchestrator listening on port ${this.port}`);
          resolve();
        }
      });
    });
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      port: this.port,
      connections: this.connections.size,
      rooms: this.rooms.size,
      uptime: process.uptime()
    };
  }
}

module.exports = WebRTCOrchestrator;