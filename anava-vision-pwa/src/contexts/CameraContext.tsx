import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Camera, CameraListResponse, ConnectionStatus } from '../types';
import { orchestratorService } from '../services/orchestratorService';
import toast from 'react-hot-toast';

interface CameraContextType {
  cameras: Camera[];
  selectedCamera: Camera | null;
  connectionStatus: ConnectionStatus;
  loading: boolean;
  error: string | null;
  refreshCameras: () => Promise<void>;
  selectCamera: (camera: Camera) => void;
  updateCameraStatus: (cameraId: string, status: Camera['status']) => void;
}

const CameraContext = createContext<CameraContextType | undefined>(undefined);

interface CameraProviderProps {
  children: ReactNode;
}

export const CameraProvider: React.FC<CameraProviderProps> = ({ children }) => {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshCameras = async () => {
    setLoading(true);
    setError(null);
    setConnectionStatus('connecting');

    try {
      const response = await orchestratorService.getCameras();
      
      if (response.success && response.data) {
        setCameras(response.data.cameras);
        setConnectionStatus('connected');
        toast.success(`Found ${response.data.cameras.length} cameras`);
      } else {
        throw new Error(response.error || 'Failed to fetch cameras');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      setConnectionStatus('error');
      toast.error(`Failed to load cameras: ${errorMessage}`);
      
      // Add demo cameras for development/offline mode
      const demoCameras: Camera[] = [
        {
          id: 'demo-1',
          name: 'Front Entrance',
          description: 'Main entrance security camera',
          streamUrl: 'demo://camera1',
          thumbnailUrl: '/demo-thumbnail-1.jpg',
          status: 'online',
          location: 'Building A - Level 1',
          capabilities: {
            ptz: true,
            zoom: true,
            presets: true,
            recording: true,
            audio: true,
          }
        },
        {
          id: 'demo-2',
          name: 'Parking Lot',
          description: 'Outdoor parking area monitoring',
          streamUrl: 'demo://camera2',
          thumbnailUrl: '/demo-thumbnail-2.jpg',
          status: 'online',
          location: 'Building A - Exterior',
          capabilities: {
            ptz: true,
            zoom: true,
            presets: false,
            recording: true,
            audio: false,
          }
        },
        {
          id: 'demo-3',
          name: 'Server Room',
          description: 'Internal server room monitoring',
          streamUrl: 'demo://camera3',
          thumbnailUrl: '/demo-thumbnail-3.jpg',
          status: 'offline',
          location: 'Building B - Level 2',
          capabilities: {
            ptz: false,
            zoom: false,
            presets: false,
            recording: true,
            audio: false,
          }
        }
      ];
      
      setCameras(demoCameras);
      toast('Running in demo mode', { icon: '🔧' });
    } finally {
      setLoading(false);
    }
  };

  const selectCamera = (camera: Camera) => {
    setSelectedCamera(camera);
    toast.success(`Selected ${camera.name}`);
  };

  const updateCameraStatus = (cameraId: string, status: Camera['status']) => {
    setCameras(prevCameras => 
      prevCameras.map(camera => 
        camera.id === cameraId ? { ...camera, status } : camera
      )
    );
    
    if (selectedCamera && selectedCamera.id === cameraId) {
      setSelectedCamera({ ...selectedCamera, status });
    }
  };

  // Auto-refresh cameras every 30 seconds
  useEffect(() => {
    refreshCameras();
    
    const interval = setInterval(refreshCameras, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-select first available camera
  useEffect(() => {
    if (cameras.length > 0 && !selectedCamera) {
      const onlineCamera = cameras.find(camera => camera.status === 'online');
      if (onlineCamera) {
        selectCamera(onlineCamera);
      }
    }
  }, [cameras, selectedCamera]);

  const value: CameraContextType = {
    cameras,
    selectedCamera,
    connectionStatus,
    loading,
    error,
    refreshCameras,
    selectCamera,
    updateCameraStatus,
  };

  return (
    <CameraContext.Provider value={value}>
      {children}
    </CameraContext.Provider>
  );
};

export const useCamera = (): CameraContextType => {
  const context = useContext(CameraContext);
  if (context === undefined) {
    throw new Error('useCamera must be used within a CameraProvider');
  }
  return context;
};

export type { Camera };