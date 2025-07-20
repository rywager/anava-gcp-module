import React, { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react';
import { WebRTCConnection, Camera, StreamResponse } from '../types';
import { orchestratorService } from '../services/orchestratorService';
import toast from 'react-hot-toast';

interface WebRTCContextType {
  connection: WebRTCConnection;
  isConnecting: boolean;
  connect: (camera: Camera) => Promise<void>;
  disconnect: () => void;
  getConnectionStatus: () => string;
}

const WebRTCContext = createContext<WebRTCContextType | undefined>(undefined);

interface WebRTCProviderProps {
  children: ReactNode;
}

export const WebRTCProvider: React.FC<WebRTCProviderProps> = ({ children }) => {
  const [connection, setConnection] = useState<WebRTCConnection>({
    peerConnection: null,
    localStream: null,
    remoteStream: null,
    connectionState: 'new',
    iceConnectionState: 'new',
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const connectionRef = useRef<RTCPeerConnection | null>(null);

  const createPeerConnection = useCallback((iceServers: RTCIceServer[] = []) => {
    const configuration: RTCConfiguration = {
      iceServers: iceServers.length > 0 ? iceServers : [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
      iceCandidatePoolSize: 10,
    };

    const pc = new RTCPeerConnection(configuration);
    
    pc.onconnectionstatechange = () => {
      setConnection(prev => ({
        ...prev,
        connectionState: pc.connectionState,
      }));
      
      if (pc.connectionState === 'connected') {
        toast.success('Video stream connected');
      } else if (pc.connectionState === 'disconnected') {
        toast.error('Video stream disconnected');
      } else if (pc.connectionState === 'failed') {
        toast.error('Connection failed');
      }
    };

    pc.oniceconnectionstatechange = () => {
      setConnection(prev => ({
        ...prev,
        iceConnectionState: pc.iceConnectionState,
      }));
    };

    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      setConnection(prev => ({
        ...prev,
        remoteStream,
      }));
    };

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        // In a real implementation, send this candidate to the remote peer
        console.log('ICE candidate:', event.candidate);
      }
    };

    return pc;
  }, []);

  const connect = useCallback(async (camera: Camera) => {
    if (isConnecting) {
      toast.error('Already connecting...');
      return;
    }

    setIsConnecting(true);
    
    try {
      // Disconnect any existing connection
      disconnect();

      toast.loading('Connecting to camera...', { id: 'webrtc-connect' });

      // Check if this is a demo camera
      if (camera.streamUrl.startsWith('demo://')) {
        // Simulate demo connection with canvas stream
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d');
        
        // Create animated demo content
        let frame = 0;
        const animate = () => {
          if (ctx) {
            // Clear canvas
            ctx.fillStyle = '#1a1a2e';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw camera name
            ctx.fillStyle = '#ffffff';
            ctx.font = '24px Arial';
            ctx.textAlign = 'center';
            ctx.fillText(camera.name, canvas.width / 2, 60);
            
            // Draw status
            ctx.font = '16px Arial';
            ctx.fillStyle = '#2ecc71';
            ctx.fillText('DEMO MODE', canvas.width / 2, 90);
            
            // Draw animated circle
            ctx.beginPath();
            ctx.arc(
              canvas.width / 2 + Math.sin(frame * 0.1) * 50,
              canvas.height / 2,
              20,
              0,
              2 * Math.PI
            );
            ctx.fillStyle = '#667eea';
            ctx.fill();
            
            // Draw timestamp
            ctx.fillStyle = '#ffffff';
            ctx.font = '12px monospace';
            ctx.fillText(
              new Date().toLocaleTimeString(),
              canvas.width / 2,
              canvas.height - 30
            );
            
            frame++;
          }
          
          if (connectionRef.current) {
            requestAnimationFrame(animate);
          }
        };
        
        animate();
        
        const stream = canvas.captureStream(30);
        
        setConnection(prev => ({
          ...prev,
          remoteStream: stream,
          connectionState: 'connected',
          iceConnectionState: 'connected',
        }));
        
        toast.success('Demo stream connected', { id: 'webrtc-connect' });
        return;
      }

      // Get stream configuration from orchestrator
      const streamResponse = await orchestratorService.getStream(camera.id);
      
      if (!streamResponse.success || !streamResponse.data) {
        throw new Error(streamResponse.error || 'Failed to get stream configuration');
      }

      const streamData: StreamResponse = streamResponse.data;
      
      // Create peer connection
      const pc = createPeerConnection(streamData.iceServers);
      connectionRef.current = pc;
      
      setConnection(prev => ({
        ...prev,
        peerConnection: pc,
      }));

      // Create offer and set local description
      const offer = await pc.createOffer({
        offerToReceiveVideo: true,
        offerToReceiveAudio: true,
      });
      
      await pc.setLocalDescription(offer);
      
      // In a real implementation, you would send the offer to the camera/server
      // and receive an answer, then set it as remote description
      
      toast.success('Connected to camera stream', { id: 'webrtc-connect' });
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Connection failed';
      toast.error(`Failed to connect: ${errorMessage}`, { id: 'webrtc-connect' });
      console.error('WebRTC connection error:', error);
    } finally {
      setIsConnecting(false);
    }
  }, [isConnecting, createPeerConnection]);

  const disconnect = useCallback(() => {
    if (connectionRef.current) {
      connectionRef.current.close();
      connectionRef.current = null;
    }

    if (connection.localStream) {
      connection.localStream.getTracks().forEach(track => track.stop());
    }

    setConnection({
      peerConnection: null,
      localStream: null,
      remoteStream: null,
      connectionState: 'new',
      iceConnectionState: 'new',
    });

    toast.success('Disconnected from camera');
  }, [connection.localStream]);

  const getConnectionStatus = useCallback(() => {
    if (isConnecting) return 'connecting';
    
    switch (connection.connectionState) {
      case 'connected':
        return 'connected';
      case 'connecting':
        return 'connecting';
      case 'disconnected':
        return 'disconnected';
      case 'failed':
        return 'error';
      default:
        return 'disconnected';
    }
  }, [isConnecting, connection.connectionState]);

  const value: WebRTCContextType = {
    connection,
    isConnecting,
    connect,
    disconnect,
    getConnectionStatus,
  };

  return (
    <WebRTCContext.Provider value={value}>
      {children}
    </WebRTCContext.Provider>
  );
};

export const useWebRTC = (): WebRTCContextType => {
  const context = useContext(WebRTCContext);
  if (context === undefined) {
    throw new Error('useWebRTC must be used within a WebRTCProvider');
  }
  return context;
};