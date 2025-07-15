const { ipcMain } = require('electron');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');

class ACAPDeploymentService {
  constructor() {
    this.deployments = new Map();
    this.setupIPC();
  }

  setupIPC() {
    ipcMain.handle('deploy-acap', async (event, cameraIp, acapFile, credentials) => {
      return this.deployACAP(cameraIp, acapFile, credentials, (progress) => {
        event.sender.send('acap-deployment-progress', { cameraIp, progress });
      });
    });

    ipcMain.handle('get-acap-status', async (event, cameraIp, packageName) => {
      return this.getACAPStatus(cameraIp, packageName);
    });

    ipcMain.handle('start-acap', async (event, cameraIp, packageName, credentials) => {
      return this.startACAP(cameraIp, packageName, credentials);
    });

    ipcMain.handle('stop-acap', async (event, cameraIp, packageName, credentials) => {
      return this.stopACAP(cameraIp, packageName, credentials);
    });

    ipcMain.handle('uninstall-acap', async (event, cameraIp, packageName, credentials) => {
      return this.uninstallACAP(cameraIp, packageName, credentials);
    });

    ipcMain.handle('get-acap-logs', async (event, cameraIp, packageName, credentials) => {
      return this.getACAPLogs(cameraIp, packageName, credentials);
    });
  }

  async deployACAP(cameraIp, acapFilePath, credentials, progressCallback) {
    const deploymentId = `${cameraIp}-${Date.now()}`;
    
    try {
      progressCallback({ stage: 'starting', percent: 0, message: 'Starting ACAP deployment...' });
      
      // Validate ACAP file
      if (!fs.existsSync(acapFilePath)) {
        throw new Error('ACAP file not found');
      }
      
      const fileStats = fs.statSync(acapFilePath);
      if (fileStats.size === 0) {
        throw new Error('ACAP file is empty');
      }
      
      progressCallback({ stage: 'uploading', percent: 10, message: 'Uploading ACAP file...' });
      
      // Upload ACAP file
      const uploadResult = await this.uploadACAPFile(cameraIp, acapFilePath, credentials, progressCallback);
      
      progressCallback({ stage: 'installing', percent: 50, message: 'Installing ACAP package...' });
      
      // Install ACAP
      const installResult = await this.installACAP(cameraIp, uploadResult.packageName, credentials);
      
      progressCallback({ stage: 'configuring', percent: 80, message: 'Configuring ACAP...' });
      
      // Configure ACAP (optional)
      await this.configureACAP(cameraIp, uploadResult.packageName, credentials);
      
      progressCallback({ stage: 'starting', percent: 90, message: 'Starting ACAP...' });
      
      // Start ACAP
      const startResult = await this.startACAP(cameraIp, uploadResult.packageName, credentials);
      
      progressCallback({ stage: 'completed', percent: 100, message: 'ACAP deployment completed successfully!' });
      
      return {
        success: true,
        deploymentId,
        packageName: uploadResult.packageName,
        status: startResult.status,
        message: 'ACAP deployed and started successfully'
      };
      
    } catch (error) {
      progressCallback({ 
        stage: 'error', 
        percent: 0, 
        message: `Deployment failed: ${error.message}` 
      });
      
      throw error;
    }
  }

  async uploadACAPFile(cameraIp, acapFilePath, credentials, progressCallback) {
    const formData = new FormData();
    const fileStream = fs.createReadStream(acapFilePath);
    
    formData.append('packfil', fileStream, {
      filename: path.basename(acapFilePath),
      contentType: 'application/octet-stream'
    });
    
    const config = {
      method: 'post',
      url: `http://${cameraIp}/axis-cgi/applications/upload.cgi`,
      headers: {
        ...formData.getHeaders(),
      },
      data: formData,
      auth: {
        username: credentials.username || 'root',
        password: credentials.password || 'pass'
      },
      timeout: 60000,
      onUploadProgress: (progressEvent) => {
        const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        progressCallback({ 
          stage: 'uploading', 
          percent: Math.min(10 + (percent * 0.4), 50), 
          message: `Uploading... ${percent}%` 
        });
      }
    };

    try {
      const response = await axios(config);
      
      // Parse response to get package name
      const packageMatch = response.data.match(/package="([^"]+)"/);
      if (!packageMatch) {
        throw new Error('Could not determine package name from upload response');
      }
      
      return {
        packageName: packageMatch[1],
        response: response.data
      };
      
    } catch (error) {
      if (error.response) {
        throw new Error(`Upload failed: ${error.response.status} ${error.response.statusText}`);
      } else if (error.request) {
        throw new Error('Upload failed: No response from camera');
      } else {
        throw new Error(`Upload failed: ${error.message}`);
      }
    }
  }

  async installACAP(cameraIp, packageName, credentials) {
    try {
      const response = await axios.post(
        `http://${cameraIp}/axis-cgi/applications/control.cgi`,
        `action=install&package=${packageName}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          auth: {
            username: credentials.username || 'root',
            password: credentials.password || 'pass'
          },
          timeout: 30000
        }
      );
      
      if (response.data.includes('Error')) {
        throw new Error(`Installation failed: ${response.data}`);
      }
      
      return {
        success: true,
        packageName,
        response: response.data
      };
      
    } catch (error) {
      throw new Error(`ACAP installation failed: ${error.message}`);
    }
  }

  async configureACAP(cameraIp, packageName, credentials) {
    // This is a placeholder for ACAP configuration
    // Implementation would depend on specific ACAP requirements
    try {
      // Example: Set basic configuration parameters
      const configParams = {
        'action': 'update',
        'package': packageName,
        'configurable': 'yes'
      };
      
      const response = await axios.post(
        `http://${cameraIp}/axis-cgi/applications/control.cgi`,
        Object.keys(configParams).map(key => `${key}=${configParams[key]}`).join('&'),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          auth: {
            username: credentials.username || 'root',
            password: credentials.password || 'pass'
          },
          timeout: 10000
        }
      );
      
      return {
        success: true,
        configuration: configParams
      };
      
    } catch (error) {
      // Configuration errors are often non-critical
      console.warn(`ACAP configuration warning: ${error.message}`);
      return {
        success: true,
        warning: error.message
      };
    }
  }

  async startACAP(cameraIp, packageName, credentials) {
    try {
      const response = await axios.post(
        `http://${cameraIp}/axis-cgi/applications/control.cgi`,
        `action=start&package=${packageName}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          auth: {
            username: credentials.username || 'root',
            password: credentials.password || 'pass'
          },
          timeout: 15000
        }
      );
      
      if (response.data.includes('Error')) {
        throw new Error(`Start failed: ${response.data}`);
      }
      
      return {
        success: true,
        packageName,
        status: 'running',
        response: response.data
      };
      
    } catch (error) {
      throw new Error(`ACAP start failed: ${error.message}`);
    }
  }

  async stopACAP(cameraIp, packageName, credentials) {
    try {
      const response = await axios.post(
        `http://${cameraIp}/axis-cgi/applications/control.cgi`,
        `action=stop&package=${packageName}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          auth: {
            username: credentials.username || 'root',
            password: credentials.password || 'pass'
          },
          timeout: 15000
        }
      );
      
      return {
        success: true,
        packageName,
        status: 'stopped',
        response: response.data
      };
      
    } catch (error) {
      throw new Error(`ACAP stop failed: ${error.message}`);
    }
  }

  async uninstallACAP(cameraIp, packageName, credentials) {
    try {
      // First stop the ACAP
      await this.stopACAP(cameraIp, packageName, credentials);
      
      // Then uninstall it
      const response = await axios.post(
        `http://${cameraIp}/axis-cgi/applications/control.cgi`,
        `action=remove&package=${packageName}`,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          auth: {
            username: credentials.username || 'root',
            password: credentials.password || 'pass'
          },
          timeout: 15000
        }
      );
      
      return {
        success: true,
        packageName,
        status: 'uninstalled',
        response: response.data
      };
      
    } catch (error) {
      throw new Error(`ACAP uninstall failed: ${error.message}`);
    }
  }

  async getACAPStatus(cameraIp, packageName, credentials) {
    try {
      const response = await axios.get(
        `http://${cameraIp}/axis-cgi/applications/list.cgi`,
        {
          auth: {
            username: credentials?.username || 'root',
            password: credentials?.password || 'pass'
          },
          timeout: 10000
        }
      );
      
      // Parse the response to find the package status
      const packageMatch = response.data.match(new RegExp(`${packageName}.*?Status=([^\\r\\n]+)`));
      const status = packageMatch ? packageMatch[1] : 'unknown';
      
      return {
        packageName,
        status,
        running: status === 'Running',
        installed: status !== 'Not installed'
      };
      
    } catch (error) {
      throw new Error(`Failed to get ACAP status: ${error.message}`);
    }
  }

  async getACAPLogs(cameraIp, packageName, credentials) {
    try {
      const response = await axios.get(
        `http://${cameraIp}/axis-cgi/applications/logs.cgi?package=${packageName}`,
        {
          auth: {
            username: credentials?.username || 'root',
            password: credentials?.password || 'pass'
          },
          timeout: 10000
        }
      );
      
      return {
        packageName,
        logs: response.data,
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      throw new Error(`Failed to get ACAP logs: ${error.message}`);
    }
  }
}

module.exports = ACAPDeploymentService;