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

  // Helper method for digest authentication
  async digestAuth(ip, username, password, method, uri, data = null, options = {}) {
    try {
      const url = `http://${ip}${uri}`;
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });
      
      // First request to get the digest challenge
      const config1 = {
        method,
        url,
        httpsAgent,
        timeout: options.timeout || 30000,
        validateStatus: () => true,
        ...options
      };

      if (data) {
        config1.data = data;
      }

      const response1 = await axios(config1);

      if (response1.status === 401) {
        const wwwAuth = response1.headers['www-authenticate'];
        if (wwwAuth && wwwAuth.includes('Digest')) {
          // Parse digest parameters
          const digestData = {};
          const regex = /(\w+)=(?:"([^"]+)"|([^,]+))/g;
          let match;
          while ((match = regex.exec(wwwAuth)) !== null) {
            digestData[match[1]] = match[2] || match[3];
          }

          // Build digest header
          const nc = '00000001';
          const cnonce = crypto.randomBytes(8).toString('hex');
          const ha1 = crypto.createHash('md5').update(`${username}:${digestData.realm}:${password}`).digest('hex');
          const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
          const response = crypto.createHash('md5').update(`${ha1}:${digestData.nonce}:${nc}:${cnonce}:${digestData.qop}:${ha2}`).digest('hex');
          
          const authHeader = `Digest username="${username}", realm="${digestData.realm}", nonce="${digestData.nonce}", uri="${uri}", qop=${digestData.qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
          
          // Second request with auth
          const config2 = {
            ...config1,
            headers: {
              ...config1.headers,
              'Authorization': authHeader
            }
          };

          const response2 = await axios(config2);
          return response2;
        }
      } else if (response1.status === 200) {
        // No auth required
        return response1;
      }
      
      throw new Error(`Unexpected response: ${response1.status}`);
    } catch (error) {
      console.error('Digest auth error:', error.message);
      throw error;
    }
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
    
    // Axis cameras expect the field name to be 'packfil'
    formData.append('packfil', fileStream, {
      filename: path.basename(acapFilePath),
      contentType: 'application/octet-stream'
    });
    
    try {
      progressCallback({ 
        stage: 'uploading', 
        percent: 10, 
        message: 'Uploading ACAP file...' 
      });

      // Use digest auth for upload
      const response = await this.digestAuth(
        cameraIp,
        credentials.username || 'root',
        credentials.password || 'pass',
        'POST',
        '/axis-cgi/applications/upload.cgi',
        formData,
        {
          headers: formData.getHeaders(),
          timeout: 60000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
              progressCallback({ 
                stage: 'uploading', 
                percent: Math.min(10 + (percent * 0.4), 50), 
                message: `Uploading... ${percent}%` 
              });
            }
          }
        }
      );
      
      console.log('Upload response:', response.data);
      
      // Parse response to get package name
      // Response format: "OK package=<packagename> version=<version>"
      const packageMatch = response.data.match(/package=([^\s]+)/);
      if (!packageMatch) {
        // Try alternate format
        const altMatch = response.data.match(/packagename\s+([^\s]+)/);
        if (!altMatch) {
          throw new Error('Could not determine package name from upload response: ' + response.data);
        }
        return {
          packageName: altMatch[1],
          response: response.data
        };
      }
      
      return {
        packageName: packageMatch[1],
        response: response.data
      };
      
    } catch (error) {
      if (error.response) {
        throw new Error(`Upload failed: ${error.response.status} ${error.response.data}`);
      } else if (error.request) {
        throw new Error('Upload failed: No response from camera');
      } else {
        throw new Error(`Upload failed: ${error.message}`);
      }
    }
  }

  async installACAP(cameraIp, packageName, credentials) {
    try {
      // For Axis cameras, the install step is often automatic after upload
      // But we'll try the install command anyway
      const params = `action=install&package=${packageName}`;
      
      const response = await this.digestAuth(
        cameraIp,
        credentials.username || 'root',
        credentials.password || 'pass',
        'POST',
        '/axis-cgi/applications/control.cgi',
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 30000
        }
      );
      
      console.log('Install response:', response.data);
      
      if (response.data.includes('Error')) {
        // Check if it's already installed
        if (response.data.includes('already installed')) {
          console.log('Package already installed, proceeding...');
        } else {
          throw new Error(`Installation failed: ${response.data}`);
        }
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
      
      const params = Object.keys(configParams).map(key => `${key}=${configParams[key]}`).join('&');
      
      const response = await this.digestAuth(
        cameraIp,
        credentials.username || 'root',
        credentials.password || 'pass',
        'POST',
        '/axis-cgi/applications/control.cgi',
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
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
      // Use GET method with query parameters for control.cgi
      const response = await this.digestAuth(
        cameraIp,
        credentials.username || 'root',
        credentials.password || 'pass',
        'GET',
        `/axis-cgi/applications/control.cgi?action=start&package=${encodeURIComponent(packageName)}`,
        null,
        {
          timeout: 15000
        }
      );
      
      console.log('Start response:', response.data);
      
      if (response.data.includes('Error')) {
        // Check if already running
        if (response.data.includes('already running')) {
          console.log('Application already running');
        } else {
          throw new Error(`Start failed: ${response.data}`);
        }
      }
      
      // Verify the application is actually running
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
      const status = await this.getACAPStatus(cameraIp, packageName, credentials);
      
      return {
        success: true,
        packageName,
        status: status.running ? 'running' : 'stopped',
        response: response.data
      };
      
    } catch (error) {
      throw new Error(`ACAP start failed: ${error.message}`);
    }
  }

  async stopACAP(cameraIp, packageName, credentials) {
    try {
      const response = await this.digestAuth(
        cameraIp,
        credentials.username || 'root',
        credentials.password || 'pass',
        'GET',
        `/axis-cgi/applications/control.cgi?action=stop&package=${encodeURIComponent(packageName)}`,
        null,
        {
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
      const response = await this.digestAuth(
        cameraIp,
        credentials.username || 'root',
        credentials.password || 'pass',
        'GET',
        `/axis-cgi/applications/control.cgi?action=remove&package=${encodeURIComponent(packageName)}`,
        null,
        {
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
      const response = await this.digestAuth(
        cameraIp,
        credentials?.username || 'root',
        credentials?.password || 'pass',
        'GET',
        '/axis-cgi/applications/list.cgi',
        null,
        {
          timeout: 10000
        }
      );
      
      console.log('List response:', response.data);
      
      // Parse the response to find the package status
      // Format: packagename version vendor status
      const lines = response.data.split('\n');
      const appLine = lines.find(line => line.trim().startsWith(packageName));
      
      if (!appLine) {
        return {
          packageName,
          status: 'Not installed',
          running: false,
          installed: false
        };
      }
      
      // Parse the status from the line
      const parts = appLine.trim().split(/\s+/);
      const status = parts.length >= 4 ? parts[3] : 'Unknown';
      
      return {
        packageName,
        status,
        running: status.toLowerCase() === 'running',
        installed: true
      };
      
    } catch (error) {
      throw new Error(`Failed to get ACAP status: ${error.message}`);
    }
  }

  async getACAPLogs(cameraIp, packageName, credentials) {
    try {
      const response = await this.digestAuth(
        cameraIp,
        credentials?.username || 'root',
        credentials?.password || 'pass',
        'GET',
        `/axis-cgi/applications/logs.cgi?package=${encodeURIComponent(packageName)}`,
        null,
        {
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