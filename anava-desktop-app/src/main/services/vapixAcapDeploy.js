const { ipcMain } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
const FormData = require('form-data');

class VapixAcapDeployService {
  constructor() {
    this.setupIPC();
  }

  setupIPC() {
    ipcMain.handle('deploy-acap-vapix', async (event, params) => {
      const { cameraIp, username, password, acapFile, acapFileName } = params;
      
      try {
        // Convert array back to buffer
        const buffer = Buffer.from(acapFile);
        
        // Deploy directly without temp file
        const result = await this.deployAcap(cameraIp, username, password, buffer, acapFileName, (progress) => {
          event.sender.send('acap-deployment-progress', { cameraIp, progress });
        });
        
        return result;
      } catch (error) {
        console.error('[VapixAcapDeploy] Deployment error:', error);
        throw error;
      }
    });
  }

  async deployAcap(cameraIp, username, password, fileBuffer, fileName, progressCallback) {
    try {
      progressCallback({ stage: 'uploading', percent: 10, message: 'Uploading ACAP...' });
      
      // Step 1: Upload the ACAP package
      const uploadResult = await this.uploadAcap(cameraIp, username, password, fileBuffer, fileName);
      
      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Upload failed');
      }
      
      progressCallback({ stage: 'installing', percent: 60, message: 'ACAP uploaded, starting application...' });
      
      // Step 2: Start the application (upload.cgi usually auto-installs)
      const startResult = await this.startApplication(cameraIp, username, password, uploadResult.packageName);
      
      if (!startResult.success) {
        throw new Error(startResult.error || 'Failed to start application');
      }
      
      progressCallback({ stage: 'verifying', percent: 90, message: 'Verifying application status...' });
      
      // Step 3: Verify the app is running
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s for app to fully start
      const statusResult = await this.checkApplicationStatus(cameraIp, username, password, uploadResult.packageName);
      
      progressCallback({ stage: 'completed', percent: 100, message: 'ACAP deployment completed!' });
      
      return {
        success: true,
        packageName: uploadResult.packageName,
        message: 'ACAP deployed and running successfully',
        status: statusResult.status
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

  async uploadAcap(cameraIp, username, password, fileBuffer, fileName) {
    console.log(`[VapixAcapDeploy] Starting upload to ${cameraIp}`);
    console.log(`[VapixAcapDeploy] File: ${fileName}, Size: ${fileBuffer.length} bytes`);
    
    return new Promise((resolve, reject) => {
      // Create form data
      const form = new FormData();
      form.append('packfil', fileBuffer, {
        filename: fileName,
        contentType: 'application/octet-stream'
      });

      // First request without auth to get digest challenge
      const options = {
        hostname: cameraIp,
        port: 80,
        path: '/axis-cgi/applications/upload.cgi',
        method: 'POST',
        headers: form.getHeaders()
      };

      const req1 = http.request(options, (res1) => {
        if (res1.statusCode === 401 && res1.headers['www-authenticate']) {
          // Parse digest challenge
          const authHeader = res1.headers['www-authenticate'];
          const digestParams = this.parseDigestChallenge(authHeader);
          
          if (!digestParams) {
            reject(new Error('Invalid digest challenge'));
            return;
          }

          // Build digest response
          const ha1 = crypto.createHash('md5')
            .update(`${username}:${digestParams.realm}:${password}`)
            .digest('hex');
          
          const ha2 = crypto.createHash('md5')
            .update(`POST:/axis-cgi/applications/upload.cgi`)
            .digest('hex');
          
          const nc = '00000001';
          const cnonce = crypto.randomBytes(8).toString('hex');
          
          const response = crypto.createHash('md5')
            .update(`${ha1}:${digestParams.nonce}:${nc}:${cnonce}:${digestParams.qop}:${ha2}`)
            .digest('hex');
          
          const authValue = `Digest username="${username}", realm="${digestParams.realm}", ` +
            `nonce="${digestParams.nonce}", uri="/axis-cgi/applications/upload.cgi", ` +
            `qop=${digestParams.qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;

          // Second request with auth
          const form2 = new FormData();
          form2.append('packfil', fileBuffer, {
            filename: fileName,
            contentType: 'application/octet-stream'
          });

          const options2 = {
            hostname: cameraIp,
            port: 80,
            path: '/axis-cgi/applications/upload.cgi',
            method: 'POST',
            headers: {
              ...form2.getHeaders(),
              'Authorization': authValue
            }
          };

          const req2 = http.request(options2, (res2) => {
            let data = '';
            
            res2.on('data', (chunk) => {
              data += chunk;
            });
            
            res2.on('end', () => {
              console.log('[VapixAcapDeploy] Upload response:', data);
              
              if (res2.statusCode === 200 && data.includes('OK')) {
                // Parse package name from response
                const packageMatch = data.match(/package=([^\s]+)/);
                const packageName = packageMatch ? packageMatch[1] : fileName.replace('.eap', '');
                
                resolve({
                  success: true,
                  packageName,
                  response: data
                });
              } else {
                resolve({
                  success: false,
                  error: `Upload failed: ${data}`
                });
              }
            });
          });

          req2.on('error', (error) => {
            reject(new Error(`Upload request failed: ${error.message}`));
          });

          // Write form data
          form2.pipe(req2);
          
        } else {
          reject(new Error(`Unexpected response: ${res1.statusCode}`));
        }
        
        // Drain response
        res1.resume();
      });

      req1.on('error', (error) => {
        console.error(`[VapixAcapDeploy] Upload request error:`, error);
        reject(new Error(`Connection failed: ${error.message}`));
      });
      
      req1.on('timeout', () => {
        console.error(`[VapixAcapDeploy] Upload request timeout`);
        req1.destroy();
        reject(new Error('Request timeout'));
      });
      
      req1.setTimeout(60000);

      // Send first request
      form.pipe(req1);
    });
  }

  async startApplication(cameraIp, username, password, packageName) {
    return new Promise((resolve, reject) => {
      const params = `action=start&package=${encodeURIComponent(packageName)}`;
      
      // First request without auth
      const options = {
        hostname: cameraIp,
        port: 80,
        path: `/axis-cgi/applications/control.cgi?${params}`,
        method: 'GET'
      };

      const req1 = http.request(options, (res1) => {
        if (res1.statusCode === 401 && res1.headers['www-authenticate']) {
          // Parse digest challenge
          const authHeader = res1.headers['www-authenticate'];
          const digestParams = this.parseDigestChallenge(authHeader);
          
          if (!digestParams) {
            reject(new Error('Invalid digest challenge'));
            return;
          }

          // Build digest response
          const ha1 = crypto.createHash('md5')
            .update(`${username}:${digestParams.realm}:${password}`)
            .digest('hex');
          
          const ha2 = crypto.createHash('md5')
            .update(`GET:/axis-cgi/applications/control.cgi?${params}`)
            .digest('hex');
          
          const nc = '00000001';
          const cnonce = crypto.randomBytes(8).toString('hex');
          
          const response = crypto.createHash('md5')
            .update(`${ha1}:${digestParams.nonce}:${nc}:${cnonce}:${digestParams.qop}:${ha2}`)
            .digest('hex');
          
          const authValue = `Digest username="${username}", realm="${digestParams.realm}", ` +
            `nonce="${digestParams.nonce}", uri="/axis-cgi/applications/control.cgi?${params}", ` +
            `qop=${digestParams.qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;

          // Second request with auth
          const options2 = {
            ...options,
            headers: {
              'Authorization': authValue
            }
          };

          const req2 = http.request(options2, (res2) => {
            let data = '';
            
            res2.on('data', (chunk) => {
              data += chunk;
            });
            
            res2.on('end', () => {
              console.log('[VapixAcapDeploy] Start response:', data);
              
              if (res2.statusCode === 200) {
                resolve({
                  success: true,
                  status: 'running',
                  response: data
                });
              } else {
                resolve({
                  success: false,
                  error: `Start failed: ${data}`
                });
              }
            });
          });

          req2.on('error', (error) => {
            reject(new Error(`Start request failed: ${error.message}`));
          });

          req2.end();
          
        } else if (res1.statusCode === 200) {
          // No auth required
          let data = '';
          res1.on('data', (chunk) => {
            data += chunk;
          });
          res1.on('end', () => {
            resolve({
              success: true,
              status: 'running',
              response: data
            });
          });
        } else {
          reject(new Error(`Unexpected response: ${res1.statusCode}`));
        }
        
        // Drain response
        res1.resume();
      });

      req1.on('error', (error) => {
        reject(new Error(`Initial request failed: ${error.message}`));
      });

      req1.end();
    });
  }

  async checkApplicationStatus(cameraIp, username, password, packageName) {
    return new Promise((resolve, reject) => {
      // Check application status
      const options = {
        hostname: cameraIp,
        port: 80,
        path: '/axis-cgi/applications/list.cgi',
        method: 'GET'
      };

      const req1 = http.request(options, (res1) => {
        if (res1.statusCode === 401 && res1.headers['www-authenticate']) {
          // Parse digest challenge
          const authHeader = res1.headers['www-authenticate'];
          const digestParams = this.parseDigestChallenge(authHeader);
          
          if (!digestParams) {
            resolve({ status: 'unknown', error: 'Invalid auth challenge' });
            return;
          }

          // Build digest response
          const ha1 = crypto.createHash('md5')
            .update(`${username}:${digestParams.realm}:${password}`)
            .digest('hex');
          
          const ha2 = crypto.createHash('md5')
            .update('GET:/axis-cgi/applications/list.cgi')
            .digest('hex');
          
          const nc = '00000001';
          const cnonce = crypto.randomBytes(8).toString('hex');
          
          const response = crypto.createHash('md5')
            .update(`${ha1}:${digestParams.nonce}:${nc}:${cnonce}:${digestParams.qop}:${ha2}`)
            .digest('hex');
          
          const authValue = `Digest username="${username}", realm="${digestParams.realm}", ` +
            `nonce="${digestParams.nonce}", uri="/axis-cgi/applications/list.cgi", ` +
            `qop=${digestParams.qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;

          // Second request with auth
          const options2 = {
            ...options,
            headers: {
              'Authorization': authValue
            }
          };

          const req2 = http.request(options2, (res2) => {
            let data = '';
            
            res2.on('data', (chunk) => {
              data += chunk;
            });
            
            res2.on('end', () => {
              console.log('[VapixAcapDeploy] Status check response:', data);
              
              // Parse the response to find our package
              const lines = data.split('\n');
              const appLine = lines.find(line => line.includes(packageName));
              
              if (appLine) {
                // Format: packagename version vendor status
                const parts = appLine.trim().split(/\s+/);
                const status = parts.length >= 4 ? parts[3] : 'unknown';
                
                resolve({
                  found: true,
                  status: status.toLowerCase(),
                  running: status.toLowerCase() === 'running'
                });
              } else {
                resolve({
                  found: false,
                  status: 'not_found'
                });
              }
            });
          });

          req2.on('error', (error) => {
            console.error('[VapixAcapDeploy] Status check error:', error);
            resolve({ status: 'error', error: error.message });
          });

          req2.end();
          
        } else {
          // No auth required or unexpected response
          resolve({ status: 'unknown' });
        }
        
        // Drain response
        res1.resume();
      });

      req1.on('error', (error) => {
        console.error('[VapixAcapDeploy] Status request error:', error);
        resolve({ status: 'error', error: error.message });
      });

      req1.end();
    });
  }

  parseDigestChallenge(authHeader) {
    const params = {};
    const regex = /(\w+)=(?:"([^"]+)"|([^,]+))/g;
    let match;
    
    while ((match = regex.exec(authHeader)) !== null) {
      params[match[1]] = match[2] || match[3];
    }
    
    return params.realm && params.nonce ? params : null;
  }
}

module.exports = VapixAcapDeployService;