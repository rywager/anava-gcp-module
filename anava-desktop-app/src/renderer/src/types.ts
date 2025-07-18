export interface User {
  email: string;
  name: string;
  picture?: string;
}

export interface AuthStatus {
  isAuthenticated: boolean;
  user?: User;
}

export interface Project {
  projectId: string;
  name: string;
  lifecycleState: string;
}

export interface TerraformOutputs {
  api_gateway_url: string;
  api_key: string;
  device_auth_sa_email: string;
  tvm_sa_email: string;
  vertex_ai_sa_email: string;
  workload_identity_pool: string;
  workload_identity_provider: string;
  firebase_config: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
  };
}

export interface Camera {
  id: string;
  ip: string;
  port?: number;
  model: string;
  manufacturer: string;
  status: 'accessible' | 'requires_auth' | 'unknown';
  authenticated?: boolean;
  credentials?: {
    username: string;
    password: string;
  };
  mac?: string;
  capabilities?: string[];
  discoveredAt?: string;
  rtspUrl?: string;
  httpUrl?: string;
  architecture?: string;
  firmwareVersion?: string;
}

export interface ACAPDeployment {
  id: string;
  cameraId: string;
  cameraIp: string;
  packageName: string;
  version: string;
  status: 'pending' | 'deploying' | 'completed' | 'failed';
  deployedAt?: string;
  error?: string;
}

export interface ElectronAPI {
  // App methods
  getVersion: () => Promise<string>;
  
  // Store methods
  store: {
    get: (key: string) => Promise<any>;
    set: (key: string, value: any) => Promise<void>;
    delete: (key: string) => Promise<void>;
  };
  
  // Dialog methods
  showErrorDialog: (title: string, content: string) => Promise<void>;
  showMessageDialog: (options: any) => Promise<any>;
  showSaveDialog: (options: any) => Promise<any>;
  showOpenDialog: (options: any) => Promise<any>;
  
  // Camera discovery
  scanNetworkCameras: () => Promise<Camera[]>;
  scanNetworkForCameras: () => Promise<Camera[]>;
  quickScanCamera: (ip: string, username: string, password: string) => Promise<Camera[]>;
  testCameraCredentials: (cameraId: string, ip: string, username: string, password: string) => Promise<{ success: boolean; authenticated: boolean; message: string }>;
  
  // ACAP deployment
  deployACAP: (params: {
    cameraIp: string;
    username: string;
    password: string;
    acapFile: number[];
    acapFileName: string;
  }) => Promise<{ success: boolean; error?: string; packageName?: string }>;
  
  // ACAP downloader
  getLatestAcaps: () => Promise<any>;
  downloadAcap: (downloadUrl: string, fileName: string) => Promise<{ success: boolean; path?: string }>;
  getDownloadedAcaps: () => Promise<string[]>;
  
  // WebRTC orchestration
  startWebRTCOrchestrator: (port: number) => Promise<void>;
  stopWebRTCOrchestrator: () => Promise<void>;
  
  // QR code generation
  generateQRCode: (data: string) => Promise<string>;
  
  // Docker integration
  dockerStatus: () => Promise<any>;
  dockerStart: (service: string) => Promise<void>;
  dockerStop: (service: string) => Promise<void>;
  dockerLogs: (service: string) => Promise<string>;
  
  // Remove all listeners
  removeAllListeners: (channel: string) => void;
  
  // Event listeners
  on: (channel: string, callback: (event: any, ...args: any[]) => void) => void;
  
  // Google Cloud Platform APIs
  gcpAPI: {
    login: () => Promise<{ success: boolean; user?: User }>;
    logout: () => Promise<{ success: boolean }>;
    getAuthStatus: () => Promise<AuthStatus>;
    listProjects: () => Promise<Project[]>;
    setProject: (projectId: string) => Promise<void>;
    onAuthStateChange: (callback: (event: any, state: AuthStatus) => void) => void;
  };
  
  // Terraform deployment APIs
  terraformAPI: {
    deploy: (projectId: string) => Promise<{ success: boolean }>;
    deployInfrastructure: (projectId: string) => Promise<{ success: boolean }>;
    getDeploymentStatus: () => Promise<any>;
    getOutputs: () => Promise<TerraformOutputs>;
    destroy: () => Promise<void>;
    destroyInfrastructure: () => Promise<void>;
    getDeployedConfig: () => Promise<TerraformOutputs | null>;
    sendConfigToCamera: (cameraIp: string, config: any, publicKey: string) => Promise<{ success: boolean }>;
    testCameraEndpoint: (cameraIp: string) => Promise<{ success: boolean }>;
    onProgress: (callback: (event: any, data: any) => void) => void;
    onComplete: (callback: (event: any, data: any) => void) => void;
    onError: (callback: (event: any, error: string) => void) => void;
  };
}