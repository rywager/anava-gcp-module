export interface Camera {
  id: string;
  name: string;
  description?: string;
  streamUrl: string;
  thumbnailUrl?: string;
  status: 'online' | 'offline' | 'error';
  location?: string;
  capabilities: CameraCapabilities;
  metadata?: Record<string, any>;
}

export interface CameraCapabilities {
  ptz: boolean;
  zoom: boolean;
  presets: boolean;
  recording: boolean;
  audio: boolean;
}

export interface PTZCommand {
  type: 'move' | 'zoom' | 'preset' | 'stop';
  direction?: 'up' | 'down' | 'left' | 'right' | 'up-left' | 'up-right' | 'down-left' | 'down-right';
  speed?: number;
  zoom?: 'in' | 'out';
  presetId?: number;
}

export interface WebRTCConnection {
  peerConnection: RTCPeerConnection | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectionState: RTCPeerConnectionState;
  iceConnectionState: RTCIceConnectionState;
}

export interface NotificationData {
  id: string;
  title: string;
  body: string;
  icon?: string;
  timestamp: Date;
  cameraId?: string;
  type: 'alert' | 'motion' | 'system' | 'error';
  read: boolean;
}

export interface InstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export interface AppSettings {
  autoConnect: boolean;
  notificationsEnabled: boolean;
  videoQuality: 'auto' | 'high' | 'medium' | 'low';
  darkMode: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
}

export interface OrchestratorResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface CameraListResponse {
  cameras: Camera[];
  total: number;
}

export interface StreamResponse {
  streamUrl: string;
  iceServers: RTCIceServer[];
  sessionId: string;
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error' | 'reconnecting';