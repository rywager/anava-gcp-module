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
  scanNetworkCameras: () => ipcRenderer.invoke('scan-network-cameras'),
  scanNetworkForCameras: () => ipcRenderer.invoke('scan-network-cameras'),
  quickScanCamera: (ip, username, password) => ipcRenderer.invoke('quick-scan-camera', ip, username, password),
  testCameraCredentials: (cameraId, ip, username, password) => ipcRenderer.invoke('test-camera-credentials', cameraId, ip, username, password),
  
  // ACAP deployment
  deployACAP: (params) => ipcRenderer.invoke('deploy-acap-vapix', params),
  
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
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  
  // Event listeners
  on: (channel, callback) => {
    // Wrap callback to ensure proper error handling for terraform:error
    if (channel === 'terraform:error') {
      ipcRenderer.on(channel, (event, error) => {
        // Ensure error is always a string
        const errorMessage = typeof error === 'string' ? error : 
                           (error && error.message) ? error.message : 
                           (error && error.toString) ? error.toString() : 
                           'Unknown error';
        callback(errorMessage);
      });
    } else {
      ipcRenderer.on(channel, (event, ...args) => callback(...args));
    }
  },
  
  // Google Cloud Platform APIs
  gcpAPI: {
    login: () => ipcRenderer.invoke('gcp:login'),
    logout: () => ipcRenderer.invoke('gcp:logout'),
    getAuthStatus: () => ipcRenderer.invoke('gcp:auth-status'),
    listProjects: () => ipcRenderer.invoke('gcp:list-projects'),
    setProject: (projectId) => ipcRenderer.invoke('gcp:set-project', projectId),
    checkBilling: (projectId) => ipcRenderer.invoke('gcp:check-billing', projectId),
    onAuthStateChange: (callback) => ipcRenderer.on('gcp:auth-state-change', callback)
  },
  
  // Terraform deployment APIs
  terraformAPI: {
    deploy: (projectId) => ipcRenderer.invoke('terraform:deploy', projectId),
    deployInfrastructure: (projectId) => ipcRenderer.invoke('terraform:deploy', projectId),
    getDeploymentStatus: () => ipcRenderer.invoke('terraform:status'),
    getOutputs: () => ipcRenderer.invoke('terraform:outputs'),
    destroy: () => ipcRenderer.invoke('terraform:destroy'),
    destroyInfrastructure: () => ipcRenderer.invoke('terraform:destroy'),
    getDeployedConfig: () => ipcRenderer.invoke('terraform:get-deployed-config'),
    sendConfigToCamera: (cameraIp, config, publicKey) => ipcRenderer.invoke('terraform:send-config-to-camera', cameraIp, config, publicKey),
    testCameraEndpoint: (cameraIp) => ipcRenderer.invoke('terraform:test-camera-endpoint', cameraIp),
    onProgress: (callback) => ipcRenderer.on('terraform:progress', callback),
    onComplete: (callback) => ipcRenderer.on('terraform:complete', callback),
    onError: (callback) => ipcRenderer.on('terraform:error', callback)
  }
});