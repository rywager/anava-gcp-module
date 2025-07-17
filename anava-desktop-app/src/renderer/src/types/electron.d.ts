// Type definitions for Electron API
declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>;
      store: {
        get: (key: string) => Promise<any>;
        set: (key: string, value: any) => Promise<void>;
        delete: (key: string) => Promise<void>;
      };
      gcpAPI: {
        getAuthStatus: () => Promise<{ isAuthenticated: boolean; user: any }>;
        listProjects: () => Promise<Array<{ projectId: string; name: string; lifecycleState: string }>>;
        setProject: (projectId: string) => Promise<void>;
        onAuthStateChange: (callback: (event: any, data: any) => void) => void;
      };
      terraformAPI: {
        deploy: (projectId: string) => Promise<{ success: boolean; output?: string; outputs?: any }>;
        deployInfrastructure: (projectId: string) => Promise<{ success: boolean; output?: string; outputs?: any }>;
        getDeploymentStatus: () => Promise<any>;
        getOutputs: () => Promise<any>;
        destroy: () => Promise<{ success: boolean; output: string }>;
        destroyInfrastructure: () => Promise<{ success: boolean; output: string }>;
        onProgress: (callback: (data: any) => void) => void;
        onComplete: (callback: (data: any) => void) => void;
        onError: (callback: (error: any) => void) => void;
      };
      on: (channel: string, callback: (...args: any[]) => void) => void;
      removeAllListeners: (channel: string) => void;
    };
  }
}

export {};