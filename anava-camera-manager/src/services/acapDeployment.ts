import axios from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { CloudConfig, DeploymentProgress } from '../types';
import { EventEmitter } from 'events';

// VAPIX endpoints for ACAP management
const VAPIX_UPLOAD = '/axis-cgi/applications/upload.cgi';
const VAPIX_INSTALL = '/axis-cgi/applications/control.cgi';
const VAPIX_LIST = '/axis-cgi/applications/list.cgi';

export const deploymentEmitter = new EventEmitter();

export async function deployACAP(cameraIP: string, config: CloudConfig): Promise<void> {
  const credentials = { username: 'root', password: 'pass' }; // In production, get from secure storage
  
  try {
    // Emit progress
    emitProgress(cameraIP, 'connecting', 0, 'Connecting to camera...');
    
    // 1. Download ACAP package if not cached
    const acapPath = await downloadACAP(config.deployment.downloadUrl);
    
    emitProgress(cameraIP, 'uploading', 20, 'Uploading ACAP package...');
    
    // 2. Upload ACAP to camera
    await uploadACAP(cameraIP, credentials, acapPath);
    
    emitProgress(cameraIP, 'installing', 50, 'Installing ACAP...');
    
    // 3. Install/Start the ACAP
    await installACAP(cameraIP, credentials, 'BatonDescribe');
    
    emitProgress(cameraIP, 'configuring', 75, 'Configuring ACAP with cloud settings...');
    
    // 4. Configure the ACAP with cloud settings
    await configureACAP(cameraIP, credentials, config);
    
    emitProgress(cameraIP, 'complete', 100, 'Deployment complete!');
    
  } catch (error: any) {
    emitProgress(cameraIP, 'error', 0, 'Deployment failed', error.message);
    throw error;
  }
}

async function downloadACAP(url: string): Promise<string> {
  // For now, assume ACAP is available locally
  // In production, download from cloud storage
  const localPath = path.join(__dirname, '../../acap/BatonDescribe.eap');
  
  // Check if file exists, if not download it
  try {
    await fs.access(localPath);
    return localPath;
  } catch {
    // Download file
    console.log(`Downloading ACAP from ${url}`);
    // Implementation would download file here
    throw new Error('ACAP download not implemented yet');
  }
}

async function uploadACAP(cameraIP: string, credentials: any, acapPath: string): Promise<void> {
  const fileData = await fs.readFile(acapPath);
  
  const formData = new FormData();
  formData.append('file', new Blob([fileData]), 'BatonDescribe.eap');
  
  const response = await axios.post(
    `http://${cameraIP}${VAPIX_UPLOAD}`,
    formData,
    {
      auth: credentials,
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    }
  );
  
  if (response.status !== 200) {
    throw new Error(`Failed to upload ACAP: ${response.statusText}`);
  }
}

async function installACAP(cameraIP: string, credentials: any, packageName: string): Promise<void> {
  // First check if already installed
  const installedApps = await listApplications(cameraIP, credentials);
  
  if (installedApps.includes(packageName)) {
    // Stop existing instance
    await controlACAP(cameraIP, credentials, packageName, 'stop');
    // Remove it
    await controlACAP(cameraIP, credentials, packageName, 'remove');
  }
  
  // Install the new version
  await controlACAP(cameraIP, credentials, packageName, 'install');
  
  // Start the application
  await controlACAP(cameraIP, credentials, packageName, 'start');
}

async function controlACAP(
  cameraIP: string,
  credentials: any,
  packageName: string,
  action: 'install' | 'start' | 'stop' | 'remove'
): Promise<void> {
  const response = await axios.post(
    `http://${cameraIP}${VAPIX_INSTALL}`,
    `package=${packageName}&action=${action}`,
    {
      auth: credentials,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );
  
  if (response.status !== 200) {
    throw new Error(`Failed to ${action} ACAP: ${response.statusText}`);
  }
}

async function listApplications(cameraIP: string, credentials: any): Promise<string[]> {
  const response = await axios.get(
    `http://${cameraIP}${VAPIX_LIST}`,
    { auth: credentials }
  );
  
  // Parse the response to get list of installed apps
  const apps: string[] = [];
  const lines = response.data.split('\\n');
  
  lines.forEach((line: string) => {
    if (line.includes('Name=')) {
      const name = line.split('Name=')[1]?.split(' ')[0];
      if (name) apps.push(name);
    }
  });
  
  return apps;
}

async function configureACAP(cameraIP: string, credentials: any, config: CloudConfig): Promise<void> {
  // Create configuration for the ACAP
  const acapConfig = {
    cloudProjectId: config.projectId,
    cloudRegion: config.region,
    enrollmentUrl: config.endpoints.enrollment,
    configUrl: config.endpoints.config,
    mcpServerUrl: config.endpoints.mcp,
    chatInterfaceUrl: config.endpoints.chat,
    certificateAuthority: config.certificates.ca,
    serverName: config.certificates.serverName,
    autoEnroll: true,
    syncInterval: 30 // seconds
  };
  
  // Write config to camera's ACAP data directory
  // This would use VAPIX param.cgi to set dynamic parameters
  // For now, we'll simulate this
  console.log('Configuring ACAP with:', acapConfig);
  
  // In production, use VAPIX to set parameters:
  // POST /axis-cgi/param.cgi?action=update
  // With body: root.BatonDescribe.Config={json}
}

function emitProgress(
  cameraId: string,
  stage: DeploymentProgress['stage'],
  progress: number,
  message: string,
  error?: string
): void {
  const progressData: DeploymentProgress = {
    cameraId,
    stage,
    progress,
    message,
    error
  };
  
  deploymentEmitter.emit('progress', progressData);
}

export async function batchDeploy(
  cameras: Array<{ ip: string }>,
  config: CloudConfig
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  
  // Deploy to cameras in parallel with concurrency limit
  const concurrency = 5;
  const queue = [...cameras];
  const active: Promise<void>[] = [];
  
  while (queue.length > 0 || active.length > 0) {
    // Start new deployments up to concurrency limit
    while (active.length < concurrency && queue.length > 0) {
      const camera = queue.shift()!;
      const deployment = deployACAP(camera.ip, config)
        .then(() => {
          results.set(camera.ip, true);
        })
        .catch((error) => {
          console.error(`Failed to deploy to ${camera.ip}:`, error);
          results.set(camera.ip, false);
        });
      
      active.push(deployment);
    }
    
    // Wait for at least one to complete
    if (active.length > 0) {
      await Promise.race(active);
      // Remove completed promises
      for (let i = active.length - 1; i >= 0; i--) {
        if (await isPromiseSettled(active[i])) {
          active.splice(i, 1);
        }
      }
    }
  }
  
  return results;
}

async function isPromiseSettled(promise: Promise<any>): Promise<boolean> {
  return Promise.race([
    promise.then(() => true).catch(() => true),
    Promise.resolve(false)
  ]);
}