import axios, { AxiosInstance } from 'axios';
import { Camera, CameraListResponse, StreamResponse, OrchestratorResponse, PTZCommand } from '../types';

class OrchestratorService {
  private api: AxiosInstance;
  private baseURL: string;

  constructor() {
    // Try to get orchestrator URL from environment or use default
    this.baseURL = process.env.REACT_APP_ORCHESTRATOR_URL || 'http://localhost:3001/api';
    
    this.api = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor
    this.api.interceptors.request.use(
      (config) => {
        console.log(`Making request to: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        console.error('Request error:', error);
        return Promise.reject(error);
      }
    );

    // Add response interceptor
    this.api.interceptors.response.use(
      (response) => {
        console.log(`Response from ${response.config.url}:`, response.status);
        return response;
      },
      (error) => {
        console.error('Response error:', error);
        
        // Handle network errors
        if (!error.response) {
          return Promise.reject(new Error('Network error - orchestrator may be offline'));
        }
        
        // Handle HTTP errors
        const status = error.response.status;
        const message = error.response.data?.message || error.response.data?.error || 'Unknown error';
        
        switch (status) {
          case 401:
            return Promise.reject(new Error('Authentication required'));
          case 403:
            return Promise.reject(new Error('Access forbidden'));
          case 404:
            return Promise.reject(new Error('Resource not found'));
          case 500:
            return Promise.reject(new Error('Server error'));
          default:
            return Promise.reject(new Error(`Error ${status}: ${message}`));
        }
      }
    );
  }

  async getCameras(): Promise<OrchestratorResponse<CameraListResponse>> {
    try {
      const response = await this.api.get<CameraListResponse>('/cameras');
      
      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch cameras',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getCamera(cameraId: string): Promise<OrchestratorResponse<Camera>> {
    try {
      const response = await this.api.get<Camera>(`/cameras/${cameraId}`);
      
      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch camera',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getStream(cameraId: string): Promise<OrchestratorResponse<StreamResponse>> {
    try {
      const response = await this.api.post<StreamResponse>(`/cameras/${cameraId}/stream`);
      
      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get stream',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async sendPTZCommand(cameraId: string, command: PTZCommand): Promise<OrchestratorResponse<void>> {
    try {
      await this.api.post(`/cameras/${cameraId}/ptz`, command);
      
      return {
        success: true,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to send PTZ command',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getCameraPresets(cameraId: string): Promise<OrchestratorResponse<Array<{ id: number; name: string }>>> {
    try {
      const response = await this.api.get(`/cameras/${cameraId}/presets`);
      
      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch presets',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async setPreset(cameraId: string, presetId: number, name: string): Promise<OrchestratorResponse<void>> {
    try {
      await this.api.post(`/cameras/${cameraId}/presets/${presetId}`, { name });
      
      return {
        success: true,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to set preset',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async gotoPreset(cameraId: string, presetId: number): Promise<OrchestratorResponse<void>> {
    try {
      await this.api.post(`/cameras/${cameraId}/presets/${presetId}/goto`);
      
      return {
        success: true,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to goto preset',
        timestamp: new Date().toISOString(),
      };
    }
  }

  async getHealth(): Promise<OrchestratorResponse<{ status: string; version: string }>> {
    try {
      const response = await this.api.get('/health');
      
      return {
        success: true,
        data: response.data,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Health check failed',
        timestamp: new Date().toISOString(),
      };
    }
  }

  // Utility method to test connectivity
  async testConnection(): Promise<boolean> {
    try {
      const result = await this.getHealth();
      return result.success;
    } catch {
      return false;
    }
  }

  // Get base URL for debugging
  getBaseURL(): string {
    return this.baseURL;
  }
}

export const orchestratorService = new OrchestratorService();