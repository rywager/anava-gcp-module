import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Camera } from '../types';

interface CameraContextType {
  cameras: Camera[];
  setCameras: React.Dispatch<React.SetStateAction<Camera[]>>;
  selectedCamera: Camera | null;
  setSelectedCamera: React.Dispatch<React.SetStateAction<Camera | null>>;
  isScanning: boolean;
  setIsScanning: React.Dispatch<React.SetStateAction<boolean>>;
  scanForCameras: () => Promise<void>;
  addCamera: (camera: Camera) => Promise<void>;
  removeCamera: (cameraId: string) => Promise<void>;
  updateCamera: (cameraId: string, updates: Partial<Camera>) => Promise<void>;
}

const CameraContext = createContext<CameraContextType | undefined>(undefined);

export const useCameraContext = () => {
  const context = useContext(CameraContext);
  if (!context) {
    throw new Error('useCameraContext must be used within a CameraProvider');
  }
  return context;
};

interface CameraProviderProps {
  children: ReactNode;
}

export const CameraProvider: React.FC<CameraProviderProps> = ({ children }) => {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<Camera | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    loadCameras();
  }, []);

  const loadCameras = async () => {
    try {
      const storedCameras = await window.electronAPI.store.get('discoveredCameras') || [];
      setCameras(storedCameras);
    } catch (error) {
      console.error('Error loading cameras:', error);
    }
  };

  const scanForCameras = async () => {
    if (isScanning) return;
    
    try {
      setIsScanning(true);
      
      const discoveredCameras = await window.electronAPI.scanNetworkForCameras();
      
      // Merge with existing cameras, avoiding duplicates
      const existingIps = cameras.map(cam => cam.ip);
      const newCameras = discoveredCameras.filter((cam: Camera) => !existingIps.includes(cam.ip));
      const updatedCameras = [...cameras, ...newCameras];
      
      setCameras(updatedCameras);
      await window.electronAPI.store.set('discoveredCameras', updatedCameras);
      
    } catch (error) {
      console.error('Error scanning for cameras:', error);
      throw error;
    } finally {
      setIsScanning(false);
    }
  };

  const addCamera = async (camera: Camera) => {
    try {
      const updatedCameras = [...cameras, camera];
      setCameras(updatedCameras);
      await window.electronAPI.store.set('discoveredCameras', updatedCameras);
    } catch (error) {
      console.error('Error adding camera:', error);
      throw error;
    }
  };

  const removeCamera = async (cameraId: string) => {
    try {
      const updatedCameras = cameras.filter(cam => cam.id !== cameraId);
      setCameras(updatedCameras);
      await window.electronAPI.store.set('discoveredCameras', updatedCameras);
      
      // Clear selected camera if it was removed
      if (selectedCamera?.id === cameraId) {
        setSelectedCamera(null);
      }
    } catch (error) {
      console.error('Error removing camera:', error);
      throw error;
    }
  };

  const updateCamera = async (cameraId: string, updates: Partial<Camera>) => {
    try {
      const updatedCameras = cameras.map(cam => 
        cam.id === cameraId ? { ...cam, ...updates } : cam
      );
      setCameras(updatedCameras);
      await window.electronAPI.store.set('discoveredCameras', updatedCameras);
      
      // Update selected camera if it matches
      if (selectedCamera?.id === cameraId) {
        setSelectedCamera({ ...selectedCamera, ...updates });
      }
    } catch (error) {
      console.error('Error updating camera:', error);
      throw error;
    }
  };

  const value: CameraContextType = {
    cameras,
    setCameras,
    selectedCamera,
    setSelectedCamera,
    isScanning,
    setIsScanning,
    scanForCameras,
    addCamera,
    removeCamera,
    updateCamera
  };

  return (
    <CameraContext.Provider value={value}>
      {children}
    </CameraContext.Provider>
  );
};