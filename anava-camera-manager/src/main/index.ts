import { app, BrowserWindow, ipcMain } from 'electron';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#1a1a1a'
  });

  // Load the index.html from webpack dev server in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished initialization
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers for network operations
ipcMain.handle('discover-cameras', async () => {
  const { discoverCameras } = await import('../services/cameraDiscovery');
  return discoverCameras();
});

ipcMain.handle('deploy-acap', async (event, cameraIP: string, config: any) => {
  const { deployACAP } = await import('../services/acapDeployment');
  return deployACAP(cameraIP, config);
});

ipcMain.handle('get-cloud-config', async () => {
  const { fetchCloudConfig } = await import('../services/cloudConfig');
  return fetchCloudConfig();
});