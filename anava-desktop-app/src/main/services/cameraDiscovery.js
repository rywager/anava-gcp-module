const { ipcMain } = require('electron');
const ping = require('ping');
const axios = require('axios');
const { spawn } = require('child_process');
const os = require('os');
const crypto = require('crypto');

class CameraDiscoveryService {
  constructor() {
    this.activeScans = new Map();
    this.setupIPC();
  }

  setupIPC() {
    ipcMain.handle('scan-network-cameras', async (event) => {
      return this.scanNetworkForCameras();
    });
    
    ipcMain.handle('quick-scan-camera', async (event, ip, username = 'root', password = 'pass') => {
      return this.quickScanSpecificCamera(ip, username, password);
    });
  }

  async quickScanSpecificCamera(ip, username = 'root', password = 'pass') {
    try {
      console.log(`=== Quick scanning camera at ${ip} with credentials ${username}:${password} ===`);
      
      // First check if the IP is reachable
      console.log(`Step 1: Checking if ${ip} is reachable...`);
      const ping = require('ping');
      const pingResult = await ping.promise.probe(ip, {
        timeout: 5,
        min_reply: 1
      });
      
      console.log(`Ping result for ${ip}:`, pingResult);
      
      if (!pingResult.alive) {
        console.log(`❌ ${ip} is not reachable via ping`);
        return [];
      }
      
      console.log(`✅ ${ip} is reachable`);
      console.log(`Step 2: Checking for camera with digest auth...`);
      
      // Try to connect to the specific camera with digest auth
      const camera = await this.checkAxisCamera(ip, username, password);
      if (camera) {
        console.log(`✅ Found camera at ${ip}:`, camera);
        return [camera];
      }
      
      console.log(`❌ No camera found at ${ip}`);
      return [];
    } catch (error) {
      console.error(`❌ Error quick scanning camera at ${ip}:`, error);
      return [];
    }
  }

  async scanNetworkForCameras() {
    try {
      const networkInterfaces = os.networkInterfaces();
      const networks = [];
      
      // Get all network interfaces
      for (const [name, addresses] of Object.entries(networkInterfaces)) {
        for (const address of addresses) {
          if (address.family === 'IPv4' && !address.internal) {
            networks.push({
              interface: name,
              address: address.address,
              netmask: address.netmask,
              network: this.getNetworkAddress(address.address, address.netmask)
            });
          }
        }
      }

      const cameras = [];
      
      for (const network of networks) {
        const networkCameras = await this.scanNetwork(network);
        cameras.push(...networkCameras);
      }

      return cameras;
    } catch (error) {
      console.error('Error scanning for cameras:', error);
      throw error;
    }
  }

  async scanNetwork(network) {
    const cameras = [];
    const networkParts = network.network.split('/');
    const baseIp = networkParts[0];
    const subnet = parseInt(networkParts[1]);
    
    // Calculate IP range
    const ipRange = this.calculateIPRange(baseIp, subnet);
    
    console.log(`Scanning network ${network.network} (${ipRange.start} - ${ipRange.end})`);
    
    const scanPromises = [];
    
    for (let i = ipRange.startNum; i <= ipRange.endNum; i++) {
      const ip = this.numberToIP(i);
      scanPromises.push(this.checkForCamera(ip));
    }
    
    // Process in batches to avoid overwhelming the network
    const batchSize = 20;
    for (let i = 0; i < scanPromises.length; i += batchSize) {
      const batch = scanPromises.slice(i, i + batchSize);
      const results = await Promise.allSettled(batch);
      
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          cameras.push(result.value);
        }
      });
    }
    
    return cameras;
  }

  async checkForCamera(ip) {
    try {
      // First, ping the IP to see if it's alive
      const pingResult = await ping.promise.probe(ip, {
        timeout: 2,
        min_reply: 1
      });
      
      if (!pingResult.alive) {
        return null;
      }
      
      // Check for common camera ports and endpoints
      const cameraChecks = [
        { port: 80, path: '/axis-cgi/param.cgi?action=list&group=Brand' },
        { port: 80, path: '/cgi-bin/guest/Video.cgi?media=MJPEG' },
        { port: 80, path: '/onvif/device_service' },
        { port: 8080, path: '/onvif/device_service' },
        { port: 554, path: '/', protocol: 'rtsp' }
      ];
      
      for (const check of cameraChecks) {
        const camera = await this.checkCameraEndpoint(ip, check);
        if (camera) {
          return camera;
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  async checkCameraEndpoint(ip, check) {
    try {
      const url = `http://${ip}:${check.port}${check.path}`;
      
      const response = await axios.get(url, {
        timeout: 3000,
        auth: {
          username: 'root',
          password: 'pass'
        },
        validateStatus: (status) => status < 500
      });
      
      if (response.status === 200 || response.status === 401) {
        // Detect camera type and model
        const cameraInfo = this.parseCameraInfo(response.data, response.headers);
        
        return {
          ip: ip,
          port: check.port,
          type: cameraInfo.type || 'Unknown',
          model: cameraInfo.model || 'Unknown',
          manufacturer: cameraInfo.manufacturer || 'Unknown',
          mac: await this.getMACAddress(ip),
          capabilities: cameraInfo.capabilities || [],
          discoveredAt: new Date().toISOString(),
          status: response.status === 200 ? 'accessible' : 'requires_auth'
        };
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  async checkAxisCamera(ip, username, password) {
    try {
      console.log(`=== Checking Axis camera at ${ip} with credentials ${username}:${password} ===`);
      
      // Multiple validation methods to ensure it's actually a camera
      console.log(`Step 3: Running camera validation...`);
      const validationResults = await this.validateCamera(ip, username, password);
      
      console.log(`Validation results:`, validationResults);
      
      if (validationResults.isCamera) {
        const camera = {
          id: `camera-${ip.replace(/\./g, '-')}`,
          ip: ip,
          port: 80,
          type: validationResults.type || 'IP Camera',
          model: validationResults.model || 'Unknown Model',
          manufacturer: validationResults.manufacturer || 'Unknown',
          mac: await this.getMACAddress(ip),
          capabilities: validationResults.capabilities || ['HTTP'],
          discoveredAt: new Date().toISOString(),
          status: 'accessible',
          credentials: { username, password },
          rtspUrl: validationResults.rtspUrl || `rtsp://${username}:${password}@${ip}:554/`,
          httpUrl: `http://${ip}`,
          validationScore: validationResults.score
        };
        
        console.log('✅ Camera validated and created:', camera);
        return camera;
      }
      
      console.log(`❌ Device at ${ip} is not a camera (score: ${validationResults.score})`);
      return null;
    } catch (error) {
      console.error(`❌ Error checking camera at ${ip}:`, error.message);
      return null;
    }
  }

  async validateCamera(ip, username, password) {
    let score = 0;
    let isCamera = false;
    let type = 'Unknown Device';
    let model = 'Unknown';
    let manufacturer = 'Unknown';
    let capabilities = [];
    let rtspUrl = null;

    // Method 1: Check for ONVIF compliance (most reliable)
    try {
      console.log('  - Testing ONVIF compliance...');
      const onvifResult = await this.checkONVIF(ip, username, password);
      if (onvifResult.isOnvif) {
        score += 50;
        isCamera = true;
        type = 'ONVIF Camera';
        capabilities.push('ONVIF');
        console.log('  ✅ ONVIF check passed (+50 points)');
        if (onvifResult.rtspUrl) {
          rtspUrl = onvifResult.rtspUrl;
          capabilities.push('RTSP');
        }
      } else {
        console.log('  ❌ ONVIF check failed');
      }
    } catch (error) {
      console.log('  ❌ ONVIF check failed:', error.message);
    }

    // Method 2: Check for RTSP server on port 554
    try {
      console.log('  - Testing RTSP server on port 554...');
      const rtspResult = await this.checkRTSP(ip, username, password);
      if (rtspResult.hasRtsp) {
        score += 30;
        isCamera = true;
        capabilities.push('RTSP');
        console.log('  ✅ RTSP check passed (+30 points)');
        if (!rtspUrl) {
          rtspUrl = rtspResult.rtspUrl;
        }
      } else {
        console.log('  ❌ RTSP check failed');
      }
    } catch (error) {
      console.log('  ❌ RTSP check failed:', error.message);
    }

    // Method 3: Check for Axis-specific endpoints
    try {
      console.log('  - Testing Axis-specific endpoints...');
      const axisResult = await this.checkAxisEndpoints(ip, username, password);
      if (axisResult.isAxis) {
        score += 40;
        isCamera = true;
        type = 'Axis Camera';
        manufacturer = 'Axis Communications';
        model = axisResult.model || model;
        capabilities.push('ACAP', 'VAPIX', 'HTTP');
        console.log('  ✅ Axis check passed (+40 points)');
        if (axisResult.rtspUrl) {
          rtspUrl = axisResult.rtspUrl;
          capabilities.push('RTSP');
        }
      } else {
        console.log('  ❌ Axis check failed');
      }
    } catch (error) {
      console.log('  ❌ Axis check failed:', error.message);
    }

    // Method 4: Check HTTP headers for camera signatures
    try {
      const headerResult = await this.checkCameraHeaders(ip, username, password);
      if (headerResult.isCamera) {
        score += 20;
        isCamera = true;
        if (headerResult.manufacturer) manufacturer = headerResult.manufacturer;
        if (headerResult.model) model = headerResult.model;
      }
    } catch (error) {
      console.log('Header check failed:', error.message);
    }

    // Method 5: Check for common camera endpoints
    try {
      const endpointResult = await this.checkCameraEndpoints(ip, username, password);
      if (endpointResult.isCamera) {
        score += 15;
        isCamera = true;
        capabilities.push('HTTP');
      }
    } catch (error) {
      console.log('Endpoint check failed:', error.message);
    }

    // Remove duplicates from capabilities
    capabilities = [...new Set(capabilities)];

    // Final decision: need at least 30 points to be considered a camera
    isCamera = score >= 30;
    
    console.log(`=== Validation Summary ===`);
    console.log(`Total score: ${score}`);
    console.log(`Is camera: ${isCamera}`);
    console.log(`Type: ${type}`);
    console.log(`Manufacturer: ${manufacturer}`);
    console.log(`Model: ${model}`);
    console.log(`Capabilities: ${capabilities.join(', ')}`);
    console.log(`RTSP URL: ${rtspUrl}`);

    return {
      isCamera,
      score,
      type,
      model,
      manufacturer,
      capabilities,
      rtspUrl
    };
  }

  async checkONVIF(ip, username, password) {
    try {
      // ONVIF discovery request
      const onvifSoap = `<?xml version="1.0" encoding="UTF-8"?>
        <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tds="http://www.onvif.org/ver10/device/wsdl">
          <soap:Header/>
          <soap:Body>
            <tds:GetDeviceInformation/>
          </soap:Body>
        </soap:Envelope>`;

      const response = await axios.post(`http://${ip}/onvif/device_service`, onvifSoap, {
        headers: {
          'Content-Type': 'application/soap+xml',
          'SOAPAction': 'http://www.onvif.org/ver10/device/wsdl/GetDeviceInformation'
        },
        auth: { username, password },
        timeout: 3000
      });

      if (response.status === 200 && response.data.includes('GetDeviceInformationResponse')) {
        return { isOnvif: true, rtspUrl: `rtsp://${username}:${password}@${ip}:554/` };
      }
    } catch (error) {
      // Try alternate ONVIF ports
      for (const port of [8080, 8000, 80]) {
        try {
          const response = await axios.post(`http://${ip}:${port}/onvif/device_service`, onvifSoap, {
            headers: {
              'Content-Type': 'application/soap+xml',
              'SOAPAction': 'http://www.onvif.org/ver10/device/wsdl/GetDeviceInformation'
            },
            auth: { username, password },
            timeout: 2000
          });

          if (response.status === 200 && response.data.includes('GetDeviceInformationResponse')) {
            return { isOnvif: true, rtspUrl: `rtsp://${username}:${password}@${ip}:554/` };
          }
        } catch (portError) {
          continue;
        }
      }
    }
    return { isOnvif: false };
  }

  async checkRTSP(ip, username, password) {
    return new Promise((resolve) => {
      const net = require('net');
      const socket = new net.Socket();
      
      socket.setTimeout(2000);
      
      socket.connect(554, ip, () => {
        socket.write(`OPTIONS rtsp://${ip}:554/ RTSP/1.0\r\nCSeq: 1\r\n\r\n`);
      });
      
      socket.on('data', (data) => {
        const response = data.toString();
        socket.destroy();
        
        if (response.includes('RTSP/1.0') && response.includes('200')) {
          resolve({ hasRtsp: true, rtspUrl: `rtsp://${username}:${password}@${ip}:554/` });
        } else {
          resolve({ hasRtsp: false });
        }
      });
      
      socket.on('error', () => {
        resolve({ hasRtsp: false });
      });
      
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ hasRtsp: false });
      });
    });
  }

  async checkAxisEndpoints(ip, username, password) {
    try {
      // Try digest authentication for Axis cameras
      const response = await this.digestAuth(ip, username, password, '/axis-cgi/param.cgi?action=list&group=Brand');
      
      if (response && response.includes('Brand=AXIS')) {
        const modelMatch = response.match(/ProdNbr=([^\\r\\n]+)/);
        return {
          isAxis: true,
          model: modelMatch ? modelMatch[1] : 'Unknown Axis Model',
          rtspUrl: `rtsp://${username}:${password}@${ip}:554/axis-media/media.amp`
        };
      }
    } catch (error) {
      console.log('Axis endpoint check error:', error.message);
    }
    return { isAxis: false };
  }

  async checkCameraHeaders(ip, username, password) {
    try {
      const response = await axios.get(`http://${ip}/`, {
        auth: { username, password },
        timeout: 2000,
        validateStatus: () => true
      });

      const server = response.headers['server'] || '';
      const contentType = response.headers['content-type'] || '';
      
      // Check for camera-specific headers
      if (server.toLowerCase().includes('axis') || 
          server.toLowerCase().includes('camera') ||
          server.toLowerCase().includes('ipcam') ||
          contentType.includes('video') ||
          contentType.includes('image')) {
        
        let manufacturer = 'Unknown';
        if (server.toLowerCase().includes('axis')) manufacturer = 'Axis Communications';
        else if (server.toLowerCase().includes('hikvision')) manufacturer = 'Hikvision';
        else if (server.toLowerCase().includes('dahua')) manufacturer = 'Dahua';
        
        return { isCamera: true, manufacturer };
      }
    } catch (error) {
      console.log('Header check error:', error.message);
    }
    return { isCamera: false };
  }

  async checkCameraEndpoints(ip, username, password) {
    const cameraEndpoints = [
      '/cgi-bin/hi3510/mjpegstream.cgi',
      '/mjpeg',
      '/video.mjpeg',
      '/image.jpg',
      '/snapshot.jpg',
      '/cgi-bin/snapshot.cgi',
      '/video.cgi',
      '/axis-cgi/mjpg/video.cgi'
    ];

    for (const endpoint of cameraEndpoints) {
      try {
        const response = await axios.get(`http://${ip}${endpoint}`, {
          auth: { username, password },
          timeout: 2000,
          validateStatus: () => true
        });

        const contentType = response.headers['content-type'] || '';
        
        if (contentType.includes('image/jpeg') || 
            contentType.includes('video/') ||
            contentType.includes('multipart/x-mixed-replace')) {
          return { isCamera: true };
        }
      } catch (error) {
        continue;
      }
    }
    return { isCamera: false };
  }

  async digestAuth(ip, username, password, path) {
    try {
      // First request to get the digest challenge
      const response1 = await axios.get(`http://${ip}${path}`, {
        timeout: 3000,
        validateStatus: () => true
      });

      if (response1.status === 401) {
        const wwwAuth = response1.headers['www-authenticate'];
        if (wwwAuth && wwwAuth.includes('Digest')) {
          const digestData = this.parseDigestAuth(wwwAuth);
          const authHeader = this.buildDigestHeader(username, password, 'GET', path, digestData);
          
          const response2 = await axios.get(`http://${ip}${path}`, {
            headers: { 'Authorization': authHeader },
            timeout: 3000
          });

          if (response2.status === 200) {
            return response2.data;
          }
        }
      }
    } catch (error) {
      console.log('Digest auth error:', error.message);
    }
    return null;
  }

  parseDigestAuth(authHeader) {
    const data = {};
    const regex = /(\w+)=(?:"([^"]+)"|([^,]+))/g;
    let match;
    
    while ((match = regex.exec(authHeader)) !== null) {
      data[match[1]] = match[2] || match[3];
    }
    
    return data;
  }

  buildDigestHeader(username, password, method, uri, digestData) {
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');
    
    const ha1 = crypto.createHash('md5').update(`${username}:${digestData.realm}:${password}`).digest('hex');
    const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
    const response = crypto.createHash('md5').update(`${ha1}:${digestData.nonce}:${nc}:${cnonce}:${digestData.qop}:${ha2}`).digest('hex');
    
    return `Digest username="${username}", realm="${digestData.realm}", nonce="${digestData.nonce}", uri="${uri}", qop=${digestData.qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
  }

  parseCameraInfo(data, headers) {
    const info = {
      type: 'IP Camera',
      manufacturer: 'Unknown',
      model: 'Unknown',
      capabilities: []
    };
    
    // Check for Axis cameras
    if (data && data.includes('Brand=AXIS')) {
      info.manufacturer = 'Axis Communications';
      const modelMatch = data.match(/ProdNbr=([^\\r\\n]+)/);
      if (modelMatch) {
        info.model = modelMatch[1];
      }
      info.capabilities = ['ACAP', 'ONVIF', 'RTSP', 'HTTP'];
    }
    
    // Check for ONVIF support
    if (data && data.includes('onvif')) {
      info.capabilities.push('ONVIF');
    }
    
    // Check server header for additional info
    const server = headers['server'];
    if (server) {
      if (server.includes('Axis')) {
        info.manufacturer = 'Axis Communications';
        info.capabilities = ['ACAP', 'ONVIF', 'RTSP', 'HTTP'];
      }
    }
    
    return info;
  }

  async getMACAddress(ip) {
    try {
      const arp = spawn('arp', ['-n', ip]);
      
      return new Promise((resolve) => {
        let output = '';
        
        arp.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        arp.on('close', () => {
          const macMatch = output.match(/([0-9a-f]{2}[:-]){5}([0-9a-f]{2})/i);
          resolve(macMatch ? macMatch[0] : null);
        });
        
        setTimeout(() => {
          arp.kill();
          resolve(null);
        }, 2000);
      });
    } catch (error) {
      return null;
    }
  }

  getNetworkAddress(ip, netmask) {
    const ipParts = ip.split('.').map(Number);
    const maskParts = netmask.split('.').map(Number);
    
    const networkParts = ipParts.map((part, index) => part & maskParts[index]);
    
    // Calculate subnet bits
    const subnetBits = maskParts.reduce((bits, part) => {
      return bits + part.toString(2).split('1').length - 1;
    }, 0);
    
    return networkParts.join('.') + '/' + subnetBits;
  }

  calculateIPRange(baseIp, subnet) {
    const ipParts = baseIp.split('.').map(Number);
    const hostBits = 32 - subnet;
    const numHosts = Math.pow(2, hostBits);
    
    const startNum = this.ipToNumber(baseIp);
    const endNum = startNum + numHosts - 1;
    
    return {
      start: baseIp,
      end: this.numberToIP(endNum),
      startNum: startNum + 1, // Skip network address
      endNum: endNum - 1      // Skip broadcast address
    };
  }

  ipToNumber(ip) {
    return ip.split('.').reduce((num, octet) => {
      return (num << 8) + parseInt(octet);
    }, 0) >>> 0;
  }

  numberToIP(num) {
    return [
      (num >>> 24) & 255,
      (num >>> 16) & 255,
      (num >>> 8) & 255,
      num & 255
    ].join('.');
  }
}

module.exports = CameraDiscoveryService;