const { Firestore } = require('@google-cloud/firestore');
const Redis = require('ioredis');
const { v4: uuidv4 } = require('uuid');

class DeviceRegistry {
  constructor(logger) {
    this.logger = logger;
    this.firestore = new Firestore();
    this.devicesCollection = this.firestore.collection('edge-devices');
    this.sessionsCollection = this.firestore.collection('signaling-sessions');
    
    // In-memory store for WebSocket connections
    this.activeConnections = new Map();
    
    // Redis for distributed state (for scaling)
    if (process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL);
      this.useRedis = true;
    } else {
      this.useRedis = false;
      this.logger.warn('Redis not configured, using in-memory storage only');
    }
    
    // Device status update interval
    this.statusUpdateInterval = setInterval(() => {
      this.updateDeviceStatuses();
    }, 30000); // 30 seconds
  }
  
  async registerDevice(deviceInfo) {
    const device = {
      deviceId: deviceInfo.deviceId,
      userId: deviceInfo.userId,
      capabilities: deviceInfo.capabilities || {},
      location: deviceInfo.location || {},
      ipAddress: deviceInfo.ipAddress,
      status: 'online',
      registeredAt: new Date(),
      lastSeen: new Date(),
      sessionCount: 0,
      metadata: {
        version: deviceInfo.version,
        platform: deviceInfo.platform
      }
    };
    
    try {
      // Store in Firestore
      await this.devicesCollection.doc(device.deviceId).set(device, { merge: true });
      
      // Store in Redis if available
      if (this.useRedis) {
        await this.redis.hset(
          'devices',
          device.deviceId,
          JSON.stringify(device)
        );
        await this.redis.expire('devices', 3600); // 1 hour TTL
      }
      
      this.logger.info(`Device registered: ${device.deviceId} for user ${device.userId}`);
      return device;
    } catch (error) {
      this.logger.error('Device registration error:', error);
      throw error;
    }
  }
  
  async unregisterDevice(deviceId, userId) {
    try {
      // Verify ownership
      const deviceDoc = await this.devicesCollection.doc(deviceId).get();
      if (!deviceDoc.exists || deviceDoc.data().userId !== userId) {
        throw new Error('Device not found or unauthorized');
      }
      
      // Update status to offline
      await this.devicesCollection.doc(deviceId).update({
        status: 'offline',
        lastSeen: new Date()
      });
      
      // Remove from Redis
      if (this.useRedis) {
        await this.redis.hdel('devices', deviceId);
      }
      
      // Remove WebSocket connection if exists
      this.activeConnections.delete(deviceId);
      
      this.logger.info(`Device unregistered: ${deviceId}`);
    } catch (error) {
      this.logger.error('Device unregistration error:', error);
      throw error;
    }
  }
  
  async getUserDevices(userId) {
    try {
      const snapshot = await this.devicesCollection
        .where('userId', '==', userId)
        .get();
      
      const devices = [];
      snapshot.forEach(doc => {
        const device = doc.data();
        // Check if device has active WebSocket connection
        device.isConnected = this.activeConnections.has(doc.id);
        devices.push(device);
      });
      
      return devices;
    } catch (error) {
      this.logger.error('Get user devices error:', error);
      throw error;
    }
  }
  
  async getAvailableDevice(userId, requirements = {}) {
    try {
      // Get user's devices
      const devices = await this.getUserDevices(userId);
      
      // Filter by requirements and connection status
      const availableDevices = devices.filter(device => {
        if (device.status !== 'online' || !device.isConnected) return false;
        
        // Check capabilities if requirements specified
        if (requirements.capabilities) {
          for (const [key, value] of Object.entries(requirements.capabilities)) {
            if (!device.capabilities[key] || device.capabilities[key] !== value) {
              return false;
            }
          }
        }
        
        // Check location proximity if required
        if (requirements.location && device.location) {
          const distance = this.calculateDistance(
            requirements.location,
            device.location
          );
          if (distance > (requirements.maxDistance || 100)) return false;
        }
        
        return true;
      });
      
      // Sort by session count (load balancing)
      availableDevices.sort((a, b) => a.sessionCount - b.sessionCount);
      
      return availableDevices[0] || null;
    } catch (error) {
      this.logger.error('Get available device error:', error);
      throw error;
    }
  }
  
  registerWebSocketConnection(deviceId, ws) {
    this.activeConnections.set(deviceId, ws);
    this.logger.info(`WebSocket registered for device: ${deviceId}`);
    
    // Update device status
    this.devicesCollection.doc(deviceId).update({
      status: 'online',
      lastSeen: new Date(),
      connectionId: ws.connectionId
    }).catch(error => {
      this.logger.error(`Failed to update device status: ${deviceId}`, error);
    });
  }
  
  unregisterWebSocketConnection(deviceId) {
    this.activeConnections.delete(deviceId);
    this.logger.info(`WebSocket unregistered for device: ${deviceId}`);
    
    // Update device status
    this.devicesCollection.doc(deviceId).update({
      status: 'offline',
      lastSeen: new Date(),
      connectionId: null
    }).catch(error => {
      this.logger.error(`Failed to update device status: ${deviceId}`, error);
    });
  }
  
  getWebSocketConnection(deviceId) {
    return this.activeConnections.get(deviceId);
  }
  
  async incrementSessionCount(deviceId) {
    try {
      await this.devicesCollection.doc(deviceId).update({
        sessionCount: Firestore.FieldValue.increment(1)
      });
    } catch (error) {
      this.logger.error(`Failed to increment session count: ${deviceId}`, error);
    }
  }
  
  async decrementSessionCount(deviceId) {
    try {
      await this.devicesCollection.doc(deviceId).update({
        sessionCount: Firestore.FieldValue.increment(-1)
      });
    } catch (error) {
      this.logger.error(`Failed to decrement session count: ${deviceId}`, error);
    }
  }
  
  async createSession(userId, deviceId, browserConnectionId) {
    const session = {
      sessionId: uuidv4(),
      userId,
      deviceId,
      browserConnectionId,
      status: 'active',
      createdAt: new Date(),
      lastActivity: new Date()
    };
    
    try {
      await this.sessionsCollection.doc(session.sessionId).set(session);
      await this.incrementSessionCount(deviceId);
      
      this.logger.info(`Session created: ${session.sessionId}`);
      return session;
    } catch (error) {
      this.logger.error('Session creation error:', error);
      throw error;
    }
  }
  
  async endSession(sessionId) {
    try {
      const sessionDoc = await this.sessionsCollection.doc(sessionId).get();
      if (!sessionDoc.exists) return;
      
      const session = sessionDoc.data();
      
      await this.sessionsCollection.doc(sessionId).update({
        status: 'ended',
        endedAt: new Date()
      });
      
      await this.decrementSessionCount(session.deviceId);
      
      this.logger.info(`Session ended: ${sessionId}`);
    } catch (error) {
      this.logger.error('Session end error:', error);
    }
  }
  
  async updateDeviceStatuses() {
    try {
      // Check all active connections
      for (const [deviceId, ws] of this.activeConnections) {
        if (!ws.isAlive) {
          this.unregisterWebSocketConnection(deviceId);
        }
      }
      
      // Update last seen for connected devices
      const batch = this.firestore.batch();
      for (const deviceId of this.activeConnections.keys()) {
        const deviceRef = this.devicesCollection.doc(deviceId);
        batch.update(deviceRef, {
          lastSeen: new Date()
        });
      }
      
      if (this.activeConnections.size > 0) {
        await batch.commit();
      }
    } catch (error) {
      this.logger.error('Device status update error:', error);
    }
  }
  
  calculateDistance(loc1, loc2) {
    if (!loc1.latitude || !loc1.longitude || !loc2.latitude || !loc2.longitude) {
      return Infinity;
    }
    
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRad(loc2.latitude - loc1.latitude);
    const dLon = this.toRad(loc2.longitude - loc1.longitude);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(loc1.latitude)) * Math.cos(this.toRad(loc2.latitude)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = R * c;
    
    return distance;
  }
  
  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }
  
  shutdown() {
    clearInterval(this.statusUpdateInterval);
    if (this.redis) {
      this.redis.disconnect();
    }
    this.logger.info('Device registry shut down');
  }
}

module.exports = DeviceRegistry;