import WebSocket from 'ws';
import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';

export interface CameraConfig {
  id: string;
  ip: string;
  port: number;
  model: string;
  username?: string;
  password?: string;
}

export interface OrchestratorConfig {
  baseUrl: string;
  wsUrl: string;
}

export interface TestSession {
  id: string;
  cameraId: string;
  status: string;
  webrtc: {
    offer?: RTCSessionDescriptionInit;
    answer?: RTCSessionDescriptionInit;
    candidates: RTCIceCandidate[];
    connectionState: string;
  };
}

export class TestHelper extends EventEmitter {
  private orchestratorClient: AxiosInstance;
  private wsConnections: Map<string, WebSocket> = new Map();
  
  constructor(
    private cameraConfig: CameraConfig,
    private orchestratorConfig: OrchestratorConfig
  ) {
    super();
    
    this.orchestratorClient = axios.create({
      baseURL: this.orchestratorConfig.baseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  // Camera Discovery Tests
  async discoverCamera(): Promise<boolean> {
    try {
      const response = await axios.get(
        `http://${this.cameraConfig.ip}:${this.cameraConfig.port}/axis-cgi/basicdeviceinfo.cgi`
      );
      
      return response.status === 200 && response.data.HardwareID === this.cameraConfig.id;
    } catch (error) {
      console.error('Camera discovery failed:', error);
      return false;
    }
  }

  async testOnvifDiscovery(): Promise<boolean> {
    try {
      const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
        <SOAP-ENV:Envelope xmlns:SOAP-ENV="http://www.w3.org/2003/05/soap-envelope">
          <SOAP-ENV:Body>
            <d:Probe xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery">
              <d:Types>dn:NetworkVideoTransmitter</d:Types>
            </d:Probe>
          </SOAP-ENV:Body>
        </SOAP-ENV:Envelope>`;

      const response = await axios.post(
        `http://${this.cameraConfig.ip}:${this.cameraConfig.port}/onvif/device_service`,
        soapBody,
        {
          headers: {
            'Content-Type': 'application/soap+xml; charset=utf-8',
            'SOAPAction': 'http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe'
          }
        }
      );

      return response.status === 200 && response.data.includes('ProbeMatches');
    } catch (error) {
      console.error('ONVIF discovery failed:', error);
      return false;
    }
  }

  // Camera Registration
  async registerCamera(): Promise<boolean> {
    try {
      const cameraData = {
        id: this.cameraConfig.id,
        ip: this.cameraConfig.ip,
        model: this.cameraConfig.model,
        capabilities: ['ptz', 'video', 'audio', 'events'],
        location: 'Test Environment',
        metadata: {
          firmware: '10.12.186',
          vendor: 'Axis'
        }
      };

      const response = await this.orchestratorClient.post('/api/cameras/register', cameraData);
      return response.status === 200 && response.data.success;
    } catch (error) {
      console.error('Camera registration failed:', error);
      return false;
    }
  }

  // Session Management
  async createSession(cameraId: string, sessionType: string = 'live'): Promise<TestSession | null> {
    try {
      const response = await this.orchestratorClient.post('/api/sessions', {
        cameraId,
        sessionType,
        options: {
          video: true,
          audio: false,
          resolution: '1920x1080',
          framerate: 30
        }
      });

      if (response.status === 200 && response.data.success) {
        return response.data.session;
      }
      return null;
    } catch (error) {
      console.error('Session creation failed:', error);
      return null;
    }
  }

  async getSession(sessionId: string): Promise<TestSession | null> {
    try {
      const response = await this.orchestratorClient.get(`/api/sessions/${sessionId}`);
      return response.status === 200 ? response.data : null;
    } catch (error) {
      console.error('Get session failed:', error);
      return null;
    }
  }

  // WebSocket Connection
  async connectWebSocket(sessionId?: string): Promise<WebSocket> {
    const wsUrl = sessionId 
      ? `${this.orchestratorConfig.wsUrl}/session/${sessionId}`
      : this.orchestratorConfig.wsUrl;

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      const connectionId = sessionId || 'global';

      ws.on('open', () => {
        console.log(`WebSocket connected: ${connectionId}`);
        this.wsConnections.set(connectionId, ws);
        this.emit('ws_connected', { connectionId, sessionId });
        resolve(ws);
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.emit('ws_message', { connectionId, message });
        } catch (error) {
          console.error('Invalid WebSocket message:', error);
        }
      });

      ws.on('error', (error) => {
        console.error(`WebSocket error (${connectionId}):`, error);
        this.emit('ws_error', { connectionId, error });
        reject(error);
      });

      ws.on('close', () => {
        console.log(`WebSocket disconnected: ${connectionId}`);
        this.wsConnections.delete(connectionId);
        this.emit('ws_disconnected', { connectionId });
      });

      // Timeout after 10 seconds
      setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.close();
          reject(new Error('WebSocket connection timeout'));
        }
      }, 10000);
    });
  }

  // WebRTC Testing
  async testWebRTCOffer(sessionId: string): Promise<RTCSessionDescriptionInit | null> {
    try {
      const offer: RTCSessionDescriptionInit = {
        type: 'offer',
        sdp: this.generateMockSDP('offer')
      };

      const response = await this.orchestratorClient.post(
        `/api/sessions/${sessionId}/offer`,
        { offer }
      );

      if (response.status === 200 && response.data.success) {
        return response.data.answer;
      }
      return null;
    } catch (error) {
      console.error('WebRTC offer failed:', error);
      return null;
    }
  }

  async testIceCandidate(sessionId: string): Promise<boolean> {
    try {
      const candidate = {
        candidate: 'candidate:1 1 UDP 2113667326 192.168.1.100 54400 typ host',
        sdpMLineIndex: 0,
        sdpMid: '0'
      };

      const response = await this.orchestratorClient.post(
        `/api/sessions/${sessionId}/candidate`,
        { candidate }
      );

      return response.status === 200 && response.data.success;
    } catch (error) {
      console.error('ICE candidate test failed:', error);
      return false;
    }
  }

  // PTZ Testing
  async testPTZControl(cameraId: string, command: string, params: any): Promise<boolean> {
    try {
      const response = await this.orchestratorClient.post(
        `/api/cameras/${cameraId}/ptz`,
        { command, params }
      );

      return response.status === 200 && response.data.status === 'executed';
    } catch (error) {
      console.error('PTZ control test failed:', error);
      return false;
    }
  }

  async testDirectPTZ(pan: number, tilt: number, zoom: number): Promise<boolean> {
    try {
      const response = await axios.get(
        `http://${this.cameraConfig.ip}:${this.cameraConfig.port}/axis-cgi/com/ptz.cgi`,
        {
          params: { pan, tilt, zoom }
        }
      );

      return response.status === 200 && response.data === 'OK';
    } catch (error) {
      console.error('Direct PTZ test failed:', error);
      return false;
    }
  }

  // Video Streaming Tests
  async testVideoStream(): Promise<boolean> {
    try {
      const response = await axios.get(
        `http://${this.cameraConfig.ip}:${this.cameraConfig.port}/axis-cgi/mjpg/video.cgi`,
        {
          params: { resolution: '640x480', fps: 15 },
          timeout: 5000,
          responseType: 'stream'
        }
      );

      return new Promise((resolve) => {
        let receivedData = false;
        
        response.data.on('data', (chunk: Buffer) => {
          if (!receivedData && chunk.length > 0) {
            receivedData = true;
            response.data.destroy();
            resolve(true);
          }
        });

        response.data.on('error', () => {
          resolve(false);
        });

        setTimeout(() => {
          if (!receivedData) {
            response.data.destroy();
            resolve(false);
          }
        }, 3000);
      });
    } catch (error) {
      console.error('Video stream test failed:', error);
      return false;
    }
  }

  // Performance Monitoring
  async measureLatency(iterations: number = 10): Promise<{ avg: number; min: number; max: number }> {
    const latencies: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const start = Date.now();
      try {
        await this.orchestratorClient.get('/api/status');
        const latency = Date.now() - start;
        latencies.push(latency);
      } catch (error) {
        console.error('Latency measurement failed:', error);
      }
    }

    if (latencies.length === 0) {
      throw new Error('No successful latency measurements');
    }

    return {
      avg: latencies.reduce((sum, l) => sum + l, 0) / latencies.length,
      min: Math.min(...latencies),
      max: Math.max(...latencies)
    };
  }

  async testThroughput(duration: number = 10000): Promise<number> {
    const startTime = Date.now();
    let requestCount = 0;
    let running = true;

    setTimeout(() => { running = false; }, duration);

    while (running) {
      try {
        await this.orchestratorClient.get('/health');
        requestCount++;
      } catch (error) {
        console.error('Throughput test request failed:', error);
      }
    }

    const actualDuration = Date.now() - startTime;
    return requestCount / (actualDuration / 1000); // requests per second
  }

  // Cleanup
  async cleanup(): Promise<void> {
    // Close all WebSocket connections
    for (const [connectionId, ws] of this.wsConnections) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    }
    this.wsConnections.clear();

    // Remove all listeners
    this.removeAllListeners();
  }

  // Utility Methods
  private generateMockSDP(type: 'offer' | 'answer'): string {
    return `v=0
o=- ${Date.now()} 2 IN IP4 127.0.0.1
s=Test Session
t=0 0
a=group:BUNDLE 0
a=msid-semantic: WMS stream
m=video 9 UDP/TLS/RTP/SAVPF 96
c=IN IP4 0.0.0.0
a=rtcp:9 IN IP4 0.0.0.0
a=ice-ufrag:test
a=ice-pwd:testpassword123456789012
a=fingerprint:sha-256 AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:00:11:22:33:44:55:66:77:88:99
a=setup:${type === 'offer' ? 'actpass' : 'active'}
a=mid:0
a=sendrecv
a=rtcp-mux
a=rtpmap:96 VP8/90000`;
  }

  // Wait for event helper
  async waitForEvent(event: string, timeout: number = 5000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for event: ${event}`));
      }, timeout);

      this.once(event, (data) => {
        clearTimeout(timer);
        resolve(data);
      });
    });
  }

  // Send WebSocket message
  sendMessage(connectionId: string, message: any): boolean {
    const ws = this.wsConnections.get(connectionId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }
}

export default TestHelper;