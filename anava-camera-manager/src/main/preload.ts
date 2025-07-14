import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  discoverCameras: () => ipcRenderer.invoke('discover-cameras'),
  deployACAP: (cameraIP: string, config: any) => ipcRenderer.invoke('deploy-acap', cameraIP, config),
  getCloudConfig: () => ipcRenderer.invoke('get-cloud-config'),
  
  // Progress tracking
  onDeploymentProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('deployment-progress', (event, progress) => callback(progress));
  },
  
  // Camera events
  onCameraDiscovered: (callback: (camera: any) => void) => {
    ipcRenderer.on('camera-discovered', (event, camera) => callback(camera));
  }
});