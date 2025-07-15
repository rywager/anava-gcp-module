const { v4: uuidv4 } = require('uuid');

class SignalingHandler {
  constructor(logger, deviceRegistry) {
    this.logger = logger;
    this.deviceRegistry = deviceRegistry;
    
    // Track active signaling sessions
    this.sessions = new Map();
    
    // Message handlers
    this.messageHandlers = {
      'request-device': this.handleDeviceRequest.bind(this),
      'offer': this.handleOffer.bind(this),
      'answer': this.handleAnswer.bind(this),
      'ice-candidate': this.handleIceCandidate.bind(this),
      'end-session': this.handleEndSession.bind(this),
      'ping': this.handlePing.bind(this)
    };
  }
  
  async handleMessage(ws, message) {
    const handler = this.messageHandlers[message.type];
    
    if (!handler) {
      this.logger.warn(`Unknown message type: ${message.type}`);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Unknown message type: ${message.type}`
      }));
      return;
    }
    
    try {
      await handler(ws, message);
    } catch (error) {
      this.logger.error(`Error handling ${message.type}:`, error);
      ws.send(JSON.stringify({
        type: 'error',
        error: `Failed to process ${message.type}`,
        details: error.message
      }));
    }
  }
  
  async handleDeviceRequest(ws, message) {
    // Only browsers can request devices
    if (ws.clientType !== 'browser') {
      throw new Error('Only browsers can request devices');
    }
    
    const { requirements } = message;
    
    // Find available device
    const device = await this.deviceRegistry.getAvailableDevice(ws.userId, requirements);
    
    if (!device) {
      ws.send(JSON.stringify({
        type: 'no-device-available',
        reason: 'No devices match the requirements or are online'
      }));
      return;
    }
    
    // Get device WebSocket connection
    const deviceWs = this.deviceRegistry.getWebSocketConnection(device.deviceId);
    
    if (!deviceWs || deviceWs.readyState !== 1) {
      ws.send(JSON.stringify({
        type: 'device-not-connected',
        deviceId: device.deviceId
      }));
      return;
    }
    
    // Create signaling session
    const session = await this.deviceRegistry.createSession(
      ws.userId,
      device.deviceId,
      ws.connectionId
    );
    
    // Store session info
    this.sessions.set(session.sessionId, {
      sessionId: session.sessionId,
      browserWs: ws,
      deviceWs: deviceWs,
      browserConnectionId: ws.connectionId,
      deviceConnectionId: deviceWs.connectionId,
      userId: ws.userId,
      deviceId: device.deviceId,
      createdAt: new Date(),
      lastActivity: new Date()
    });
    
    // Store session ID on WebSocket connections
    ws.sessionId = session.sessionId;
    deviceWs.sessionId = session.sessionId;
    
    // Notify both parties
    ws.send(JSON.stringify({
      type: 'device-assigned',
      sessionId: session.sessionId,
      deviceId: device.deviceId,
      deviceCapabilities: device.capabilities
    }));
    
    deviceWs.send(JSON.stringify({
      type: 'session-request',
      sessionId: session.sessionId,
      userId: ws.userId,
      userEmail: ws.userEmail,
      requirements: requirements
    }));
    
    this.logger.info(`Session ${session.sessionId} created between browser ${ws.connectionId} and device ${device.deviceId}`);
  }
  
  async handleOffer(ws, message) {
    const { sessionId, sdp } = message;
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    // Update last activity
    session.lastActivity = new Date();
    
    // Determine target (browser -> device or device -> browser)
    const targetWs = ws.clientType === 'browser' ? session.deviceWs : session.browserWs;
    
    if (!targetWs || targetWs.readyState !== 1) {
      throw new Error('Target connection not available');
    }
    
    // Relay the offer
    targetWs.send(JSON.stringify({
      type: 'offer',
      sessionId,
      sdp,
      from: ws.clientType
    }));
    
    this.logger.debug(`Relayed offer for session ${sessionId} from ${ws.clientType}`);
  }
  
  async handleAnswer(ws, message) {
    const { sessionId, sdp } = message;
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    // Update last activity
    session.lastActivity = new Date();
    
    // Answer should come from device to browser
    if (ws.clientType !== 'edge-gateway') {
      throw new Error('Only edge gateways can send answers');
    }
    
    const targetWs = session.browserWs;
    
    if (!targetWs || targetWs.readyState !== 1) {
      throw new Error('Browser connection not available');
    }
    
    // Relay the answer
    targetWs.send(JSON.stringify({
      type: 'answer',
      sessionId,
      sdp
    }));
    
    this.logger.debug(`Relayed answer for session ${sessionId}`);
  }
  
  async handleIceCandidate(ws, message) {
    const { sessionId, candidate } = message;
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }
    
    // Update last activity
    session.lastActivity = new Date();
    
    // Determine target
    const targetWs = ws.clientType === 'browser' ? session.deviceWs : session.browserWs;
    
    if (!targetWs || targetWs.readyState !== 1) {
      throw new Error('Target connection not available');
    }
    
    // Relay the ICE candidate
    targetWs.send(JSON.stringify({
      type: 'ice-candidate',
      sessionId,
      candidate,
      from: ws.clientType
    }));
    
    this.logger.debug(`Relayed ICE candidate for session ${sessionId} from ${ws.clientType}`);
  }
  
  async handleEndSession(ws, message) {
    const { sessionId } = message;
    await this.endSession(sessionId, `Ended by ${ws.clientType}`);
  }
  
  async handlePing(ws, message) {
    ws.send(JSON.stringify({
      type: 'pong',
      timestamp: Date.now()
    }));
  }
  
  async endSession(sessionId, reason) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return;
    }
    
    this.logger.info(`Ending session ${sessionId}: ${reason}`);
    
    // Notify both parties
    const endMessage = JSON.stringify({
      type: 'session-ended',
      sessionId,
      reason
    });
    
    if (session.browserWs && session.browserWs.readyState === 1) {
      session.browserWs.send(endMessage);
      delete session.browserWs.sessionId;
    }
    
    if (session.deviceWs && session.deviceWs.readyState === 1) {
      session.deviceWs.send(endMessage);
      delete session.deviceWs.sessionId;
    }
    
    // Update session in database
    await this.deviceRegistry.endSession(sessionId);
    
    // Remove from active sessions
    this.sessions.delete(sessionId);
  }
  
  handleDisconnection(ws) {
    // End any active session
    if (ws.sessionId) {
      this.endSession(ws.sessionId, `${ws.clientType} disconnected`);
    }
    
    // If it's a device, update registry
    if (ws.clientType === 'edge-gateway' && ws.deviceId) {
      this.deviceRegistry.unregisterWebSocketConnection(ws.deviceId);
    }
  }
  
  // Clean up stale sessions periodically
  startCleanupInterval() {
    setInterval(() => {
      const now = new Date();
      const staleTimeout = 5 * 60 * 1000; // 5 minutes
      
      for (const [sessionId, session] of this.sessions) {
        const timeSinceActivity = now - session.lastActivity;
        
        if (timeSinceActivity > staleTimeout) {
          this.logger.warn(`Cleaning up stale session: ${sessionId}`);
          this.endSession(sessionId, 'Session timeout');
        }
      }
    }, 60000); // Check every minute
  }
}

module.exports = SignalingHandler;