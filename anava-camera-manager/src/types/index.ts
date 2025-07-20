export interface Camera {
  id: string;
  ip: string;
  model: string;
  serialNumber: string;
  firmware: string;
  discovered: Date;
  status: 'online' | 'offline' | 'deploying' | 'deployed';
  acapVersion?: string;
  lastSeen?: Date;
}

export interface CloudConfig {
  projectId: string;
  region: string;
  endpoints: {
    enrollment: string;
    config: string;
    mcp: string;
    chat: string;
  };
  certificates: {
    ca: string;
    serverName: string;
  };
  deployment: {
    acapVersion: string;
    downloadUrl: string;
  };
}

export interface DeploymentProgress {
  cameraId: string;
  stage: 'connecting' | 'uploading' | 'installing' | 'configuring' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  error?: string;
}

export interface VAPIXCredentials {
  username: string;
  password: string;
}

export interface MCPServer {
  url: string;
  wsUrl: string;
  status: 'connecting' | 'connected' | 'error';
  camera: Camera;
}

// Extend window interface for TypeScript
declare global {
  interface Window {
    electronAPI: {
      discoverCameras: () => Promise<Camera[]>;
      deployACAP: (cameraIP: string, config: CloudConfig) => Promise<void>;
      getCloudConfig: () => Promise<CloudConfig>;
      onDeploymentProgress: (callback: (progress: DeploymentProgress) => void) => void;
      onCameraDiscovered: (callback: (camera: Camera) => void) => void;
    };
  }
}