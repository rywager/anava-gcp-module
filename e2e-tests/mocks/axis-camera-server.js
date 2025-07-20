const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');
const xml2js = require('xml2js');
const fs = require('fs');
const path = require('path');

class MockAxisCameraServer {
  constructor(config = {}) {
    this.port = config.port || 8080;
    this.wsPort = config.wsPort || 8081;
    this.cameraId = config.cameraId || 'ACCC8EF85A3C';
    this.model = config.model || 'AXIS P3245-V';
    this.firmware = config.firmware || '10.12.186';
    this.app = express();
    this.wss = null;
    this.clients = new Map();
    
    // Camera state
    this.state = {
      pan: 0,
      tilt: 0,
      zoom: 1,
      focus: 'auto',
      iris: 'auto',
      streaming: false,
      recording: false,
      motionDetection: true,
      audioEnabled: true,
      resolution: '1920x1080',
      framerate: 30,
      bitrate: 4000000,
      codec: 'H.264'
    };

    // Mock video stream data
    this.mockVideoFrame = Buffer.alloc(1024 * 10); // 10KB mock frame
    this.mockVideoFrame.fill(0xFF);
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(bodyParser.json());
    this.app.use(bodyParser.urlencoded({ extended: true }));
    this.app.use(bodyParser.text({ type: 'text/xml' }));
    
    // Request logging
    this.app.use((req, res, next) => {
      console.log(`[MockCamera] ${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // ONVIF Discovery Response
    this.app.post('/onvif/device_service', (req, res) => {
      const soapResponse = this.generateOnvifDiscoveryResponse();
      res.set('Content-Type', 'application/soap+xml');
      res.send(soapResponse);
    });

    // Device Information
    this.app.get('/axis-cgi/basicdeviceinfo.cgi', (req, res) => {
      res.json({
        Architecture: 'armv7hf',
        Brand: 'AXIS',
        BuildDate: 'Jan 10 2024 15:42:19',
        HardwareID: this.cameraId,
        ProdFullName: this.model,
        ProdNbr: 'P3245-V',
        ProdShortName: 'AXIS P3245-V',
        ProdType: 'Network Camera',
        ProdVariant: '',
        SerialNumber: this.cameraId,
        Version: this.firmware,
        WebURL: `http://localhost:${this.port}`
      });
    });

    // Parameter API
    this.app.get('/axis-cgi/param.cgi', (req, res) => {
      const { action, group } = req.query;
      
      if (action === 'list') {
        const params = this.getParameters(group);
        res.type('text/plain');
        res.send(params);
      } else if (action === 'set') {
        // Handle parameter updates
        res.send('OK');
      }
    });

    // PTZ Control
    this.app.get('/axis-cgi/com/ptz.cgi', (req, res) => {
      const { pan, tilt, zoom, query } = req.query;
      
      if (query === 'position') {
        res.type('text/plain');
        res.send(`pan=${this.state.pan}\ntilt=${this.state.tilt}\nzoom=${this.state.zoom}`);
      } else {
        // Update PTZ position
        if (pan !== undefined) this.state.pan = parseFloat(pan);
        if (tilt !== undefined) this.state.tilt = parseFloat(tilt);
        if (zoom !== undefined) this.state.zoom = parseFloat(zoom);
        
        res.send('OK');
        
        // Notify WebSocket clients
        this.broadcastState();
      }
    });

    // Video Stream
    this.app.get('/axis-cgi/mjpg/video.cgi', (req, res) => {
      const { resolution, fps, compression } = req.query;
      
      res.writeHead(200, {
        'Content-Type': 'multipart/x-mixed-replace; boundary=myboundary',
        'Cache-Control': 'no-cache',
        'Connection': 'close',
        'Pragma': 'no-cache'
      });

      // Send mock MJPEG frames
      const sendFrame = () => {
        if (!res.headersSent && this.state.streaming) {
          const frameData = this.generateMockFrame();
          res.write('--myboundary\r\n');
          res.write('Content-Type: image/jpeg\r\n');
          res.write(`Content-Length: ${frameData.length}\r\n`);
          res.write('\r\n');
          res.write(frameData);
          res.write('\r\n');
          
          setTimeout(sendFrame, 1000 / (fps || this.state.framerate));
        }
      };

      this.state.streaming = true;
      sendFrame();

      req.on('close', () => {
        this.state.streaming = false;
        console.log('[MockCamera] Video stream closed');
      });
    });

    // RTSP URL Info
    this.app.get('/axis-cgi/rtspurl.cgi', (req, res) => {
      res.type('text/plain');
      res.send(`rtsp://localhost:554/axis-media/media.amp?resolution=${this.state.resolution}&fps=${this.state.framerate}`);
    });

    // Event Stream
    this.app.get('/axis-cgi/eventstream.cgi', (req, res) => {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      const sendEvent = () => {
        const event = this.generateMockEvent();
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      };

      const interval = setInterval(sendEvent, 5000);

      req.on('close', () => {
        clearInterval(interval);
        console.log('[MockCamera] Event stream closed');
      });
    });

    // Applications API
    this.app.get('/axis-cgi/applications/list.cgi', (req, res) => {
      res.type('text/xml');
      res.send(`<?xml version="1.0" encoding="UTF-8"?>
<root>
  <application>
    <name>vmd</name>
    <nicename>AXIS Video Motion Detection</nicename>
    <vendor>Axis Communications</vendor>
    <version>4.5-0</version>
    <applicationid>143440</applicationid>
    <status>Running</status>
  </application>
  <application>
    <name>anava_edge_gateway</name>
    <nicename>Anava Edge Gateway</nicename>
    <vendor>Anava Vision</vendor>
    <version>1.0.0</version>
    <applicationid>999999</applicationid>
    <status>Running</status>
  </application>
</root>`);
    });

    // Upload Application
    this.app.post('/axis-cgi/applications/upload.cgi', (req, res) => {
      // Simulate application upload
      setTimeout(() => {
        res.json({
          status: 'success',
          message: 'Application uploaded successfully',
          applicationId: uuidv4()
        });
      }, 2000);
    });

    // WebRTC Signaling
    this.app.post('/webrtc/offer', (req, res) => {
      const { offer, streamId } = req.body;
      
      // Generate mock answer
      const answer = {
        type: 'answer',
        sdp: this.generateMockSDP('answer')
      };
      
      res.json({ answer, streamId });
    });

    // Health Check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        uptime: process.uptime(),
        camera: {
          id: this.cameraId,
          model: this.model,
          state: this.state
        }
      });
    });
  }

  setupWebSocket() {
    this.wss = new WebSocket.Server({ port: this.wsPort });
    
    this.wss.on('connection', (ws, req) => {
      const clientId = uuidv4();
      this.clients.set(clientId, ws);
      
      console.log(`[MockCamera] WebSocket client connected: ${clientId}`);
      
      // Send initial state
      ws.send(JSON.stringify({
        type: 'state',
        data: this.state
      }));
      
      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message);
          this.handleWebSocketMessage(clientId, data);
        } catch (error) {
          console.error('[MockCamera] Invalid WebSocket message:', error);
        }
      });
      
      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`[MockCamera] WebSocket client disconnected: ${clientId}`);
      });
    });
  }

  handleWebSocketMessage(clientId, data) {
    const { type, payload } = data;
    
    switch (type) {
      case 'ptz':
        this.state.pan = payload.pan || this.state.pan;
        this.state.tilt = payload.tilt || this.state.tilt;
        this.state.zoom = payload.zoom || this.state.zoom;
        this.broadcastState();
        break;
        
      case 'stream':
        if (payload.action === 'start') {
          this.startVideoStream(clientId);
        } else if (payload.action === 'stop') {
          this.stopVideoStream(clientId);
        }
        break;
        
      case 'config':
        Object.assign(this.state, payload);
        this.broadcastState();
        break;
    }
  }

  startVideoStream(clientId) {
    const ws = this.clients.get(clientId);
    if (!ws) return;
    
    const streamInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(this.mockVideoFrame);
      } else {
        clearInterval(streamInterval);
      }
    }, 33); // ~30fps
  }

  broadcastState() {
    const message = JSON.stringify({
      type: 'state',
      data: this.state
    });
    
    this.clients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
      }
    });
  }

  generateOnvifDiscoveryResponse() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope">
  <SOAP-ENV:Body>
    <d:ProbeMatches xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery">
      <d:ProbeMatch>
        <wsa:EndpointReference xmlns:wsa="http://schemas.xmlsoap.org/ws/2004/08/addressing">
          <wsa:Address>urn:uuid:${uuidv4()}</wsa:Address>
        </wsa:EndpointReference>
        <d:Types>dn:NetworkVideoTransmitter</d:Types>
        <d:Scopes>
          onvif://www.onvif.org/type/NetworkVideoTransmitter
          onvif://www.onvif.org/hardware/${this.model}
          onvif://www.onvif.org/name/${this.cameraId}
          onvif://www.onvif.org/location/Mock
        </d:Scopes>
        <d:XAddrs>http://localhost:${this.port}/onvif/device_service</d:XAddrs>
        <d:MetadataVersion>1</d:MetadataVersion>
      </d:ProbeMatch>
    </d:ProbeMatches>
  </SOAP-ENV:Body>
</SOAP-ENV:Envelope>`;
  }

  generateMockSDP(type) {
    return `v=0
o=- ${Date.now()} 2 IN IP4 127.0.0.1
s=Mock Camera Stream
t=0 0
a=group:BUNDLE 0 1
a=msid-semantic: WMS stream
m=video 9 UDP/TLS/RTP/SAVPF 96 97
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:mock
a=ice-pwd:mockpassword123456789012
a=fingerprint:sha-256 00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00:00
a=setup:${type === 'offer' ? 'actpass' : 'active'}
a=mid:0
a=sendrecv
a=rtcp-mux
a=rtpmap:96 VP8/90000
a=rtpmap:97 H264/90000
a=fmtp:97 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42001f`;
  }

  generateMockFrame() {
    // Generate a simple JPEG-like header
    const header = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]);
    const footer = Buffer.from([0xFF, 0xD9]);
    
    // Random data for the "image"
    const imageData = Buffer.alloc(1024 * 5); // 5KB
    for (let i = 0; i < imageData.length; i++) {
      imageData[i] = Math.floor(Math.random() * 256);
    }
    
    return Buffer.concat([header, imageData, footer]);
  }

  generateMockEvent() {
    const events = [
      {
        topic: 'tns1:VideoSource/MotionAlarm',
        timestamp: new Date().toISOString(),
        data: {
          state: Math.random() > 0.5,
          source: 'VideoSource_1'
        }
      },
      {
        topic: 'tns1:Device/Trigger/DigitalInput',
        timestamp: new Date().toISOString(),
        data: {
          state: Math.random() > 0.8,
          input: 'Input_1'
        }
      },
      {
        topic: 'tns1:AudioSource/AudioDetection',
        timestamp: new Date().toISOString(),
        data: {
          level: Math.floor(Math.random() * 100),
          source: 'AudioSource_1'
        }
      }
    ];
    
    return events[Math.floor(Math.random() * events.length)];
  }

  getParameters(group) {
    const params = {
      'root.Image': [
        'root.Image.I0.Enabled=yes',
        `root.Image.I0.Resolution=${this.state.resolution}`,
        'root.Image.I0.Compression=30',
        `root.Image.I0.RateControl.Mode=vbr`,
        `root.Image.I0.RateControl.TargetBitrate=${this.state.bitrate}`,
        `root.Image.I0.Stream.FPS=${this.state.framerate}`
      ].join('\n'),
      'root.PTZ': [
        'root.PTZ.PTZ.Enabled=yes',
        `root.PTZ.PTZ.CurrentPan=${this.state.pan}`,
        `root.PTZ.PTZ.CurrentTilt=${this.state.tilt}`,
        `root.PTZ.PTZ.CurrentZoom=${this.state.zoom}`,
        'root.PTZ.Limit.L1.MinPan=-180',
        'root.PTZ.Limit.L1.MaxPan=180',
        'root.PTZ.Limit.L1.MinTilt=-90',
        'root.PTZ.Limit.L1.MaxTilt=90'
      ].join('\n'),
      'root.Network': [
        'root.Network.Interface.I0.Active=yes',
        'root.Network.Interface.I0.MTU=1500',
        'root.Network.Interface.I0.IPv4.Enabled=yes',
        'root.Network.RTSP.Port=554',
        'root.Network.HTTP.Port=80',
        'root.Network.HTTPS.Port=443'
      ].join('\n')
    };
    
    return params[group] || Object.values(params).join('\n');
  }

  async start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        console.log(`[MockCamera] HTTP server listening on port ${this.port}`);
        console.log(`[MockCamera] WebSocket server listening on port ${this.wsPort}`);
        console.log(`[MockCamera] Camera ID: ${this.cameraId}`);
        console.log(`[MockCamera] Model: ${this.model}`);
        resolve();
      });
    });
  }

  async stop() {
    return new Promise((resolve) => {
      this.wss.close(() => {
        this.server.close(() => {
          console.log('[MockCamera] Server stopped');
          resolve();
        });
      });
    });
  }
}

// Start server if run directly
if (require.main === module) {
  const camera = new MockAxisCameraServer({
    port: process.env.CAMERA_PORT || 8080,
    wsPort: process.env.CAMERA_WS_PORT || 8081,
    cameraId: process.env.CAMERA_ID || 'ACCC8EF85A3C',
    model: process.env.CAMERA_MODEL || 'AXIS P3245-V'
  });
  
  camera.start().catch(console.error);
  
  process.on('SIGINT', async () => {
    await camera.stop();
    process.exit(0);
  });
}

module.exports = MockAxisCameraServer;