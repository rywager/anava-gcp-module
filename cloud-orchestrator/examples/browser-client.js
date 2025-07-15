/**
 * Browser Client Example for Cloud Orchestrator
 * This demonstrates how a browser connects to the orchestrator and requests a device
 */

class CloudOrchestratorClient {
  constructor(serverUrl, firebaseAuth) {
    this.serverUrl = serverUrl;
    this.firebaseAuth = firebaseAuth;
    this.ws = null;
    this.connectionId = null;
    this.sessionId = null;
    this.peerConnection = null;
    
    this.eventHandlers = {
      'device-assigned': this.handleDeviceAssigned.bind(this),
      'offer': this.handleOffer.bind(this),
      'answer': this.handleAnswer.bind(this),
      'ice-candidate': this.handleIceCandidate.bind(this),
      'session-ended': this.handleSessionEnded.bind(this),
      'error': this.handleError.bind(this)
    };
  }
  
  async connect() {
    try {
      // Get Firebase ID token
      const user = this.firebaseAuth.currentUser;
      if (!user) {
        throw new Error('User not authenticated');
      }
      
      const token = await user.getIdToken();
      
      // Connect to WebSocket
      const wsUrl = this.serverUrl.replace('https://', 'wss://').replace('http://', 'ws://');
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = () => {
        console.log('Connected to Cloud Orchestrator');
        
        // Authenticate
        this.ws.send(JSON.stringify({
          type: 'auth',
          token: token,
          clientType: 'browser'
        }));
      };
      
      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log('Received message:', message.type);
        
        if (message.type === 'auth-success') {
          this.connectionId = message.connectionId;
          console.log('Authenticated successfully');
          return;
        }
        
        const handler = this.eventHandlers[message.type];
        if (handler) {
          handler(message);
        } else {
          console.log('Unhandled message type:', message.type);
        }
      };
      
      this.ws.onclose = () => {
        console.log('Disconnected from Cloud Orchestrator');
        this.cleanup();
      };
      
      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
    } catch (error) {
      console.error('Connection failed:', error);
      throw error;
    }
  }
  
  async requestDevice(requirements = {}) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Not connected to orchestrator');
    }
    
    this.ws.send(JSON.stringify({
      type: 'request-device',
      requirements: requirements
    }));
  }
  
  async handleDeviceAssigned(message) {
    console.log('Device assigned:', message.deviceId);
    this.sessionId = message.sessionId;
    
    // Set up WebRTC peer connection
    this.peerConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });
    
    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws.send(JSON.stringify({
          type: 'ice-candidate',
          sessionId: this.sessionId,
          candidate: event.candidate
        }));
      }
    };
    
    // Handle incoming stream
    this.peerConnection.ontrack = (event) => {
      console.log('Received remote stream');
      const videoElement = document.getElementById('remoteVideo');
      if (videoElement) {
        videoElement.srcObject = event.streams[0];
      }
    };
    
    // Create offer
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    
    this.ws.send(JSON.stringify({
      type: 'offer',
      sessionId: this.sessionId,
      sdp: offer
    }));
  }
  
  async handleAnswer(message) {
    console.log('Received answer from device');
    
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(message.sdp)
      );
    }
  }
  
  async handleOffer(message) {
    console.log('Received offer from device');
    
    if (this.peerConnection) {
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription(message.sdp)
      );
      
      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);
      
      this.ws.send(JSON.stringify({
        type: 'answer',
        sessionId: this.sessionId,
        sdp: answer
      }));
    }
  }
  
  async handleIceCandidate(message) {
    console.log('Received ICE candidate from device');
    
    if (this.peerConnection) {
      await this.peerConnection.addIceCandidate(
        new RTCIceCandidate(message.candidate)
      );
    }
  }
  
  handleSessionEnded(message) {
    console.log('Session ended:', message.reason);
    this.cleanup();
  }
  
  handleError(message) {
    console.error('Orchestrator error:', message.error);
  }
  
  endSession() {
    if (this.sessionId) {
      this.ws.send(JSON.stringify({
        type: 'end-session',
        sessionId: this.sessionId
      }));
    }
  }
  
  cleanup() {
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    
    this.sessionId = null;
  }
  
  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
    this.cleanup();
  }
}

// Example usage:
/*
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = { ... };
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const client = new CloudOrchestratorClient('wss://your-orchestrator-url', auth);

// Connect and request a device
client.connect().then(() => {
  client.requestDevice({
    capabilities: {
      hasCamera: true,
      hasMotionSensor: true
    },
    location: {
      latitude: 37.7749,
      longitude: -122.4194
    },
    maxDistance: 50 // km
  });
});
*/