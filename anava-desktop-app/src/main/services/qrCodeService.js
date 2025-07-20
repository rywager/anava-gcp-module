const { ipcMain } = require('electron');
const QRCode = require('qrcode');

class QRCodeService {
  constructor() {
    this.setupIPC();
  }

  setupIPC() {
    ipcMain.handle('generate-qr-code', async (event, data) => {
      return this.generateQRCode(data);
    });

    ipcMain.handle('generate-camera-qr', async (event, cameraData) => {
      return this.generateCameraQR(cameraData);
    });

    ipcMain.handle('generate-mobile-qr', async (event, connectionData) => {
      return this.generateMobileQR(connectionData);
    });

    ipcMain.handle('generate-webrtc-qr', async (event, sessionData) => {
      return this.generateWebRTCQR(sessionData);
    });
  }

  async generateQRCode(data, options = {}) {
    try {
      const qrOptions = {
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF'
        },
        width: 256,
        ...options
      };

      const qrCodeDataURL = await QRCode.toDataURL(data, qrOptions);
      
      return {
        success: true,
        dataURL: qrCodeDataURL,
        data: data,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      throw new Error(`Failed to generate QR code: ${error.message}`);
    }
  }

  async generateCameraQR(cameraData) {
    try {
      const qrData = {
        type: 'camera_connection',
        version: '1.0',
        camera: {
          id: cameraData.id,
          ip: cameraData.ip,
          port: cameraData.port,
          manufacturer: cameraData.manufacturer,
          model: cameraData.model,
          capabilities: cameraData.capabilities
        },
        connection: {
          protocol: 'http',
          auth: cameraData.credentials ? {
            username: cameraData.credentials.username,
            // Note: Don't include password in QR code for security
            requiresAuth: true
          } : null
        },
        timestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      };

      const result = await this.generateQRCode(JSON.stringify(qrData));
      
      return {
        ...result,
        type: 'camera_connection',
        cameraId: cameraData.id
      };
    } catch (error) {
      throw new Error(`Failed to generate camera QR code: ${error.message}`);
    }
  }

  async generateMobileQR(connectionData) {
    try {
      const qrData = {
        type: 'mobile_app_connection',
        version: '1.0',
        app: {
          name: 'Anava Vision Desktop',
          version: '1.0.0',
          platform: process.platform
        },
        connection: {
          host: connectionData.host || 'localhost',
          port: connectionData.port || 8080,
          protocol: connectionData.protocol || 'http',
          endpoint: connectionData.endpoint || '/mobile'
        },
        session: {
          id: connectionData.sessionId || this.generateSessionId(),
          token: connectionData.token || this.generateToken(),
          expires: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour
        },
        timestamp: new Date().toISOString()
      };

      const result = await this.generateQRCode(JSON.stringify(qrData));
      
      return {
        ...result,
        type: 'mobile_app_connection',
        sessionId: qrData.session.id,
        token: qrData.session.token
      };
    } catch (error) {
      throw new Error(`Failed to generate mobile QR code: ${error.message}`);
    }
  }

  async generateWebRTCQR(sessionData) {
    try {
      const qrData = {
        type: 'webrtc_session',
        version: '1.0',
        session: {
          id: sessionData.sessionId || this.generateSessionId(),
          roomId: sessionData.roomId || this.generateRoomId(),
          peerId: sessionData.peerId || this.generatePeerId(),
          role: sessionData.role || 'viewer'
        },
        signaling: {
          server: sessionData.signalingServer || 'localhost',
          port: sessionData.signalingPort || 8080,
          protocol: sessionData.protocol || 'ws',
          path: sessionData.path || '/signaling'
        },
        ice: {
          stunServers: sessionData.stunServers || ['stun:stun.l.google.com:19302'],
          turnServers: sessionData.turnServers || []
        },
        camera: sessionData.camera ? {
          id: sessionData.camera.id,
          ip: sessionData.camera.ip,
          name: `${sessionData.camera.manufacturer} ${sessionData.camera.model}`
        } : null,
        timestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() // 2 hours
      };

      const result = await this.generateQRCode(JSON.stringify(qrData));
      
      return {
        ...result,
        type: 'webrtc_session',
        sessionId: qrData.session.id,
        roomId: qrData.session.roomId,
        peerId: qrData.session.peerId
      };
    } catch (error) {
      throw new Error(`Failed to generate WebRTC QR code: ${error.message}`);
    }
  }

  generateSessionId() {
    return 'session_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
  }

  generateRoomId() {
    return 'room_' + Math.random().toString(36).substr(2, 9);
  }

  generatePeerId() {
    return 'peer_' + Math.random().toString(36).substr(2, 9);
  }

  generateToken() {
    return Math.random().toString(36).substr(2, 15) + Math.random().toString(36).substr(2, 15);
  }

  // Utility method to validate QR code data
  validateQRData(data) {
    try {
      const parsed = JSON.parse(data);
      
      if (!parsed.type || !parsed.version) {
        return { valid: false, error: 'Missing required fields' };
      }
      
      if (parsed.expiresAt && new Date(parsed.expiresAt) < new Date()) {
        return { valid: false, error: 'QR code has expired' };
      }
      
      return { valid: true, data: parsed };
    } catch (error) {
      return { valid: false, error: 'Invalid QR code format' };
    }
  }

  // Generate QR code with custom styling for Anava branding
  async generateBrandedQR(data, options = {}) {
    const brandedOptions = {
      ...options,
      color: {
        dark: '#1976d2', // Anava blue
        light: '#FFFFFF'
      },
      width: 300,
      margin: 2,
      errorCorrectionLevel: 'M'
    };

    return this.generateQRCode(data, brandedOptions);
  }
}

module.exports = QRCodeService;