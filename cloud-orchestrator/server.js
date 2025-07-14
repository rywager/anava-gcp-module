const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { v4: uuidv4 } = require('uuid');
const winston = require('winston');
const rateLimit = require('express-rate-limit');

// Import custom modules
const { authenticateToken, authenticateWebSocket } = require('./middleware/auth');
const DeviceRegistry = require('./services/deviceRegistry');
const SignalingHandler = require('./services/signalingHandler');
const HealthCheck = require('./services/healthCheck');

// Initialize logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Initialize WebSocket server
const wss = new WebSocket.Server({ 
  server,
  perMessageDeflate: {
    zlibDeflateOptions: {
      chunkSize: 1024,
      memLevel: 7,
      level: 3
    },
    zlibInflateOptions: {
      chunkSize: 10 * 1024
    },
    clientNoContextTakeover: true,
    serverNoContextTakeover: true,
    serverMaxWindowBits: 10,
    concurrencyLimit: 10,
    threshold: 1024
  }
});

// Initialize services
const deviceRegistry = new DeviceRegistry(logger);
const signalingHandler = new SignalingHandler(logger, deviceRegistry);
const healthCheck = new HealthCheck(logger, deviceRegistry);

// Middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// API Routes
app.get('/health', (req, res) => {
  const health = healthCheck.getStatus();
  res.status(health.status === 'healthy' ? 200 : 503).json(health);
});

// Device management API
app.post('/api/devices/register', authenticateToken, async (req, res) => {
  try {
    const { deviceId, capabilities, location } = req.body;
    const userId = req.user.uid;
    
    const device = await deviceRegistry.registerDevice({
      deviceId,
      userId,
      capabilities,
      location,
      ipAddress: req.ip
    });
    
    res.json({ success: true, device });
  } catch (error) {
    logger.error('Device registration error:', error);
    res.status(500).json({ error: 'Failed to register device' });
  }
});

app.get('/api/devices', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.uid;
    const devices = await deviceRegistry.getUserDevices(userId);
    res.json({ devices });
  } catch (error) {
    logger.error('Get devices error:', error);
    res.status(500).json({ error: 'Failed to retrieve devices' });
  }
});

app.delete('/api/devices/:deviceId', authenticateToken, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const userId = req.user.uid;
    
    await deviceRegistry.unregisterDevice(deviceId, userId);
    res.json({ success: true });
  } catch (error) {
    logger.error('Device unregistration error:', error);
    res.status(500).json({ error: 'Failed to unregister device' });
  }
});

// WebSocket connection handling
wss.on('connection', async (ws, req) => {
  const connectionId = uuidv4();
  logger.info(`New WebSocket connection: ${connectionId}`);
  
  // Set up connection properties
  ws.connectionId = connectionId;
  ws.isAlive = true;
  ws.authenticated = false;
  
  // Ping-pong for connection health
  ws.on('pong', () => {
    ws.isAlive = true;
  });
  
  // Handle messages
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle authentication first
      if (data.type === 'auth') {
        const authResult = await authenticateWebSocket(data.token);
        if (authResult.success) {
          ws.authenticated = true;
          ws.userId = authResult.user.uid;
          ws.userEmail = authResult.user.email;
          
          // Register connection based on client type
          if (data.clientType === 'edge-gateway') {
            await deviceRegistry.registerWebSocketConnection(data.deviceId, ws);
            ws.deviceId = data.deviceId;
            ws.clientType = 'edge-gateway';
          } else {
            ws.clientType = 'browser';
          }
          
          ws.send(JSON.stringify({
            type: 'auth-success',
            connectionId,
            userId: ws.userId
          }));
          
          logger.info(`Authenticated ${ws.clientType}: ${connectionId}`);
        } else {
          ws.send(JSON.stringify({
            type: 'auth-error',
            error: 'Authentication failed'
          }));
          ws.close(1008, 'Authentication failed');
        }
        return;
      }
      
      // Require authentication for all other messages
      if (!ws.authenticated) {
        ws.send(JSON.stringify({
          type: 'error',
          error: 'Not authenticated'
        }));
        return;
      }
      
      // Handle signaling messages
      await signalingHandler.handleMessage(ws, data);
      
    } catch (error) {
      logger.error(`Message handling error for ${connectionId}:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        error: 'Invalid message format'
      }));
    }
  });
  
  // Handle disconnection
  ws.on('close', () => {
    logger.info(`WebSocket disconnected: ${connectionId}`);
    
    if (ws.deviceId) {
      deviceRegistry.unregisterWebSocketConnection(ws.deviceId);
    }
    
    // Clean up any active sessions
    signalingHandler.handleDisconnection(ws);
  });
  
  // Handle errors
  ws.on('error', (error) => {
    logger.error(`WebSocket error for ${connectionId}:`, error);
  });
  
  // Send initial ping
  ws.send(JSON.stringify({ type: 'ping' }));
});

// Heartbeat interval to check connection health
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (!ws.isAlive) {
      logger.warn(`Terminating inactive connection: ${ws.connectionId}`);
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping();
  });
}, 30000); // 30 seconds

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  clearInterval(heartbeatInterval);
  
  server.close(() => {
    logger.info('HTTP server closed');
    
    // Close all WebSocket connections
    wss.clients.forEach((ws) => {
      ws.close(1001, 'Server shutting down');
    });
    
    // Clean up resources
    deviceRegistry.shutdown();
    
    process.exit(0);
  });
});

// Start server
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  logger.info(`Cloud Orchestrator running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Max connections: ${process.env.MAX_CONNECTIONS || 'unlimited'}`);
});