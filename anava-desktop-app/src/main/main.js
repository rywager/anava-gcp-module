const { app, BrowserWindow, ipcMain, Menu, dialog, shell } = require('electron');
const { autoUpdater } = require('electron-updater');
const Store = require('electron-store');
const log = require('electron-log');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

// Import services
const CameraDiscoveryService = require('./services/cameraDiscovery');
const ACAPDeploymentService = require('./services/acapDeployment');
const WebRTCOrchestrator = require('./services/webrtcOrchestrator');
const QRCodeService = require('./services/qrCodeService');
const AcapDownloaderService = require('./services/acapDownloader');
const GCPAuthService = require('./services/gcpAuthService');
const TerraformService = require('./services/terraformService');

// Configure logging
log.transports.file.level = 'info';
autoUpdater.logger = log;

// Initialize store
const store = new Store();

// Keep a global reference of the window object
let mainWindow;
let splashWindow;

// Initialize services
let cameraDiscoveryService;
let acapDeploymentService;
let webrtcOrchestrator;
let qrCodeService;
let acapDownloaderService;
let gcpAuthService;
let terraformService;

// Auto-updater configuration
if (!isDev) {
  autoUpdater.checkForUpdatesAndNotify();
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 300,
    frame: false,
    alwaysOnTop: true,
    transparent: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  splashWindow.loadFile(path.join(__dirname, '../renderer/splash.html'));
  
  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function createMainWindow() {
  // Create the browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon: path.join(__dirname, '../../assets/icon.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the app
  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, '../renderer/build/index.html')}`;
  
  mainWindow.loadURL(startUrl);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    if (splashWindow) {
      splashWindow.close();
    }
    mainWindow.show();
    
    // Always open DevTools to see errors
    mainWindow.webContents.openDevTools();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Project',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('menu-new-project');
          }
        },
        {
          label: 'Open Project',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openDirectory'],
              title: 'Open Project Directory'
            });
            
            if (!result.canceled) {
              mainWindow.webContents.send('menu-open-project', result.filePaths[0]);
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow.webContents.send('menu-settings');
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forcereload' },
        { role: 'toggledevtools' },
        { type: 'separator' },
        { role: 'resetzoom' },
        { role: 'zoomin' },
        { role: 'zoomout' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'close' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Anava Vision',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Anava Vision',
              message: 'Anava Vision Desktop',
              detail: 'Version 1.0.0\n\nA professional camera management and WebRTC orchestration platform.'
            });
          }
        },
        {
          label: 'Check for Updates',
          click: () => {
            autoUpdater.checkForUpdatesAndNotify();
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Initialize services
function initializeServices() {
  try {
    cameraDiscoveryService = new CameraDiscoveryService();
    acapDeploymentService = new ACAPDeploymentService();
    webrtcOrchestrator = new WebRTCOrchestrator();
    qrCodeService = new QRCodeService();
    acapDownloaderService = new AcapDownloaderService();
    gcpAuthService = new GCPAuthService(store);
    terraformService = new TerraformService();
    
    log.info('All services initialized successfully');
  } catch (error) {
    log.error('Failed to initialize services:', error);
  }
}

// App event handlers
app.whenReady().then(() => {
  createSplashWindow();
  createMainWindow();
  createMenu();
  initializeServices();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers
ipcMain.handle('app-version', () => {
  return app.getVersion();
});

ipcMain.handle('store-get', (event, key) => {
  return store.get(key);
});

ipcMain.handle('store-set', (event, key, value) => {
  store.set(key, value);
});

ipcMain.handle('store-delete', (event, key) => {
  store.delete(key);
});

ipcMain.handle('show-error-dialog', (event, title, content) => {
  dialog.showErrorBox(title, content);
});

ipcMain.handle('show-message-dialog', async (event, options) => {
  const result = await dialog.showMessageBox(mainWindow, options);
  return result;
});

ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

// Google Cloud Platform IPC handlers
ipcMain.handle('gcp:login', async () => {
  try {
    const result = await gcpAuthService.authenticate();
    mainWindow.webContents.send('gcp:auth-state-change', { 
      isAuthenticated: true, 
      user: result.user 
    });
    return result;
  } catch (error) {
    log.error('GCP login error:', error);
    throw error;
  }
});

ipcMain.handle('gcp:logout', async () => {
  try {
    // Clear stored credentials
    store.delete('gcpTokens');
    store.delete('gcpUser');
    mainWindow.webContents.send('gcp:auth-state-change', { 
      isAuthenticated: false 
    });
    return { success: true };
  } catch (error) {
    log.error('GCP logout error:', error);
    throw error;
  }
});

ipcMain.handle('gcp:auth-status', async () => {
  try {
    // Check if gcloud is authenticated
    const { execSync } = require('child_process');
    const result = execSync('gcloud auth list --format=json', { encoding: 'utf8' });
    const accounts = JSON.parse(result);
    const activeAccount = accounts.find(a => a.status === 'ACTIVE');
    
    return {
      isAuthenticated: !!activeAccount,
      user: activeAccount ? { email: activeAccount.account, name: activeAccount.account } : null
    };
  } catch (error) {
    return {
      isAuthenticated: false,
      user: null
    };
  }
});

ipcMain.handle('gcp:list-projects', async () => {
  try {
    // Use gcloud CLI instead of OAuth tokens
    const { execSync } = require('child_process');
    const result = execSync('gcloud projects list --format=json', { encoding: 'utf8' });
    const projects = JSON.parse(result);
    return projects.map(p => ({
      projectId: p.projectId,
      name: p.name,
      lifecycleState: p.lifecycleState
    }));
  } catch (error) {
    log.error('List projects error:', error);
    throw new Error('Run: gcloud auth login');
  }
});

ipcMain.handle('gcp:set-project', async (event, projectId) => {
  try {
    store.set('gcpProjectId', projectId);
    return await gcpAuthService.setProject(projectId);
  } catch (error) {
    log.error('Set project error:', error);
    throw error;
  }
});

// Terraform deployment IPC handlers
ipcMain.handle('terraform:deploy', async (event, projectId) => {
  try {
    // Initialize Terraform with the project
    await terraformService.initialize(projectId);
    
    // Run terraform init
    mainWindow.webContents.send('terraform:progress', { 
      stage: 'init', 
      message: 'Initializing Terraform...' 
    });
    await terraformService.init((progress) => {
      mainWindow.webContents.send('terraform:progress', progress);
    });
    
    // Run terraform plan
    mainWindow.webContents.send('terraform:progress', { 
      stage: 'plan', 
      message: 'Planning infrastructure...' 
    });
    await terraformService.plan((progress) => {
      mainWindow.webContents.send('terraform:progress', progress);
    });
    
    // Run terraform apply
    mainWindow.webContents.send('terraform:progress', { 
      stage: 'apply', 
      message: 'Deploying infrastructure...' 
    });
    await terraformService.apply((progress) => {
      mainWindow.webContents.send('terraform:progress', progress);
    });
    
    // Get outputs
    const outputs = await terraformService.getOutputs();
    
    // Store outputs for later use
    store.set('terraformOutputs', outputs);
    
    mainWindow.webContents.send('terraform:complete', { outputs });
    return { success: true, outputs };
  } catch (error) {
    log.error('Terraform deploy error:', error);
    mainWindow.webContents.send('terraform:error', error.message);
    throw error;
  }
});

ipcMain.handle('terraform:status', async () => {
  return store.get('terraformOutputs') || null;
});

ipcMain.handle('terraform:outputs', async () => {
  try {
    return await terraformService.getOutputs();
  } catch (error) {
    return store.get('terraformOutputs') || null;
  }
});

ipcMain.handle('terraform:destroy', async () => {
  try {
    mainWindow.webContents.send('terraform:progress', { 
      stage: 'destroy', 
      message: 'Destroying infrastructure...' 
    });
    
    await terraformService.destroy((progress) => {
      mainWindow.webContents.send('terraform:progress', progress);
    });
    
    store.delete('terraformOutputs');
    
    mainWindow.webContents.send('terraform:complete', { destroyed: true });
    return { success: true };
  } catch (error) {
    log.error('Terraform destroy error:', error);
    mainWindow.webContents.send('terraform:error', error.message);
    throw error;
  }
});

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  log.info('Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  log.info('Update available.');
});

autoUpdater.on('update-not-available', (info) => {
  log.info('Update not available.');
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater. ' + err);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = "Download speed: " + progressObj.bytesPerSecond;
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
  log.info(log_message);
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded');
  autoUpdater.quitAndInstall();
});