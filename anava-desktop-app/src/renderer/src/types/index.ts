export interface Camera {
  id: string;
  ip: string;
  port: number;
  type: string;
  model: string;
  manufacturer: string;
  mac?: string;
  capabilities: string[];
  discoveredAt: string;
  status: 'accessible' | 'requires_auth' | 'offline';
  credentials?: {
    username: string;
    password: string;
  };
}

export interface ACAPPackage {
  id: string;
  name: string;
  version: string;
  description: string;
  filePath: string;
  size: number;
  uploadedAt: string;
}

export interface ACAPDeployment {
  id: string;
  cameraId: string;
  packageId: string;
  status: 'pending' | 'uploading' | 'installing' | 'configuring' | 'starting' | 'completed' | 'failed';
  progress: number;
  message: string;
  startedAt: string;
  completedAt?: string;
  error?: string;
}

export interface WebRTCConnection {
  id: string;
  cameraId: string;
  peerId: string;
  status: 'connecting' | 'connected' | 'disconnected' | 'failed';
  type: 'offer' | 'answer';
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  cameraId: string;
  type: 'text' | 'image' | 'video' | 'system';
  content: string;
  timestamp: string;
  sender: 'user' | 'camera' | 'system';
}

export interface QRCodeData {
  id: string;
  type: 'camera_connect' | 'mobile_app' | 'webrtc_session';
  data: string;
  generatedAt: string;
  expiresAt?: string;
}

export interface ApplicationSettings {
  general: {
    theme: 'light' | 'dark' | 'system';
    autoStart: boolean;
    minimizeToTray: boolean;
    checkForUpdates: boolean;
  };
  network: {
    discoveryTimeout: number;
    connectionTimeout: number;
    retryAttempts: number;
    defaultCredentials: {
      username: string;
      password: string;
    };
  };
  webrtc: {
    stunServers: string[];
    turnServers: string[];
    port: number;
    enableLogging: boolean;
  };
  acap: {
    deploymentTimeout: number;
    autoStart: boolean;
    backupOnUpdate: boolean;
  };
}

declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>;
      store: {
        get: (key: string) => Promise<any>;
        set: (key: string, value: any) => Promise<void>;
        delete: (key: string) => Promise<void>;
      };
      showErrorDialog: (title: string, content: string) => Promise<void>;
      showMessageDialog: (options: any) => Promise<any>;
      showSaveDialog: (options: any) => Promise<any>;
      showOpenDialog: (options: any) => Promise<any>;
      onMenuNewProject: (callback: () => void) => void;
      onMenuOpenProject: (callback: (path: string) => void) => void;
      onMenuSettings: (callback: () => void) => void;
      scanNetworkForCameras: () => Promise<Camera[]>;
      deployACAP: (cameraIp: string, acapFile: string, credentials: any) => Promise<any>;
      startWebRTCOrchestrator: (port: number) => Promise<any>;
      stopWebRTCOrchestrator: () => Promise<any>;
      generateQRCode: (data: string) => Promise<string>;
      dockerStatus: () => Promise<any>;
      dockerStart: (service: string) => Promise<any>;
      dockerStop: (service: string) => Promise<any>;
      dockerLogs: (service: string) => Promise<any>;
      removeAllListeners: (channel: string) => void;
    };
  }
}