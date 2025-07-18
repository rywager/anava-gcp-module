// API Types
export interface AuthStatus {
  isAuthenticated: boolean;
  user: User | null;
}

export interface User {
  email: string;
  name: string;
  picture?: string;
}

export interface GCPProject {
  projectId: string;
  name: string;
  lifecycleState: string;
}

export interface DeploymentConfig {
  apiGatewayUrl: string;
  apiKey: string;
  deviceAuthUrl: string;
  tvmUrl: string;
  firebaseConfig: FirebaseConfig;
  serviceAccounts: ServiceAccounts;
  storageBuckets: StorageBuckets;
  wifProvider: string;
}

export interface FirebaseConfig {
  projectId: string;
  apiKey: string;
  authDomain: string;
  storageBucket: string;
  databaseURL?: string;
  messagingSenderId?: string;
  appId: string;
}

export interface ServiceAccounts {
  vertexAi: string;
  deviceAuth: string;
  tvm: string;
  apiGateway: string;
}

export interface StorageBuckets {
  firebase: string;
  functionSource: string;
}

// Deployment Task Types
export type DeploymentTaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface DeploymentTask {
  name: string;
  status: DeploymentTaskStatus;
  progress?: number;
  detail?: string;
}

// Terraform Progress Types
export interface TerraformProgress {
  stage?: string;
  message?: string;
  type?: 'stdout' | 'stderr' | 'progress';
  resource?: string;
  action?: string;
  data?: string;
}

// Window API Types
declare global {
  interface Window {
    electronAPI: {
      gcpAPI: {
        login: () => Promise<{ success: boolean; user?: User }>;
        logout: () => Promise<{ success: boolean }>;
        getAuthStatus: () => Promise<AuthStatus>;
        listProjects: () => Promise<GCPProject[]>;
        setProject: (projectId: string) => Promise<string>;
      };
      terraformAPI: {
        deploy: (projectId: string) => Promise<{ success: boolean; outputs?: any }>;
        getDeploymentStatus: () => Promise<any>;
        getOutputs: () => Promise<any>;
        destroy: () => Promise<{ success: boolean }>;
        getDeployedConfig: () => Promise<DeploymentConfig | null>;
        sendConfigToCamera: (cameraIp: string, config: DeploymentConfig, publicKey?: string) => Promise<any>;
        testCameraEndpoint: (cameraIp: string) => Promise<{ accessible: boolean; error?: string }>;
        onProgress: (callback: (data: TerraformProgress) => void) => void;
        onComplete: (callback: (data: any) => void) => void;
        onError: (callback: (error: string) => void) => void;
      };
      store: {
        get: (key: string) => Promise<any>;
        set: (key: string, value: any) => Promise<void>;
        delete: (key: string) => Promise<void>;
      };
      on: (channel: string, callback: (...args: any[]) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}