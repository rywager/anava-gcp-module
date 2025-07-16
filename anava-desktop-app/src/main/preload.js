const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App methods
  getVersion: () => ipcRenderer.invoke('app-version'),
  
  // Store methods
  store: {
    get: (key) => ipcRenderer.invoke('store-get', key),
    set: (key, value) => ipcRenderer.invoke('store-set', key, value),
    delete: (key) => ipcRenderer.invoke('store-delete', key)
  },
  
  // Dialog methods
  showErrorDialog: (title, content) => ipcRenderer.invoke('show-error-dialog', title, content),
  showMessageDialog: (options) => ipcRenderer.invoke('show-message-dialog', options),
  showSaveDialog: (options) => ipcRenderer.invoke('show-save-dialog', options),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  
  // Menu event listeners
  onMenuNewProject: (callback) => ipcRenderer.on('menu-new-project', callback),
  onMenuOpenProject: (callback) => ipcRenderer.on('menu-open-project', callback),
  onMenuSettings: (callback) => ipcRenderer.on('menu-settings', callback),
  
  // Camera discovery
  scanNetworkForCameras: () => ipcRenderer.invoke('scan-network-cameras'),
  quickScanCamera: (ip, username, password) => ipcRenderer.invoke('quick-scan-camera', ip, username, password),
  testCameraCredentials: (cameraId, ip, username, password) => ipcRenderer.invoke('test-camera-credentials', cameraId, ip, username, password),
  
  // ACAP deployment
  deployACAP: (cameraIp, acapFile, progress) => ipcRenderer.invoke('deploy-acap', cameraIp, acapFile, progress),
  
  // ACAP downloader
  getLatestAcaps: () => ipcRenderer.invoke('get-latest-acaps'),
  downloadAcap: (downloadUrl, fileName) => ipcRenderer.invoke('download-acap', downloadUrl, fileName),
  getDownloadedAcaps: () => ipcRenderer.invoke('get-downloaded-acaps'),
  
  // WebRTC orchestration
  startWebRTCOrchestrator: (port) => ipcRenderer.invoke('start-webrtc-orchestrator', port),
  stopWebRTCOrchestrator: () => ipcRenderer.invoke('stop-webrtc-orchestrator'),
  
  // QR code generation
  generateQRCode: (data) => ipcRenderer.invoke('generate-qr-code', data),
  
  // Docker integration
  dockerStatus: () => ipcRenderer.invoke('docker-status'),
  dockerStart: (service) => ipcRenderer.invoke('docker-start', service),
  dockerStop: (service) => ipcRenderer.invoke('docker-stop', service),
  dockerLogs: (service) => ipcRenderer.invoke('docker-logs', service),
  
  // Remove all listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});