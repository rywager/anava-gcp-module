const { ipcMain } = require('electron');
const ping = require('ping');
const axios = require('axios');
const { spawn } = require('child_process');
const os = require('os');

class CameraDiscoveryService {
  constructor() {
    this.activeScans = new Map();
    this.setupIPC();
  }

  setupIPC() {
    ipcMain.handle('scan-network-cameras', async (event) => {
      return this.scanNetworkForCameras();
    });
    
    ipcMain.handle('quick-scan-camera', async (event, ip) => {
      return this.quickScanSpecificCamera(ip);
    });
  }

  async quickScanSpecificCamera(ip) {
    try {
      console.log(`Quick scanning camera at ${ip}`);
      
      // Try to connect to the specific camera with digest auth
      const camera = await this.checkAxisCamera(ip, 'root', 'pass');
      if (camera) {
        console.log(`Found camera at ${ip}:`, camera);
        return [camera];
      }
      
      console.log(`No camera found at ${ip}`);
      return [];
    } catch (error) {
      console.error(`Error quick scanning camera at ${ip}:`, error);
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
      console.log(`Checking Axis camera at ${ip} with credentials ${username}:${password}`);
      
      // Try to access the Axis parameter endpoint with digest auth
      const response = await axios.get(`http://${ip}/axis-cgi/param.cgi?action=list&group=Brand`, {
        timeout: 5000,
        auth: {
          username: username,
          password: password
        },
        validateStatus: (status) => status < 500
      });
      
      console.log(`Response status: ${response.status}`);
      
      if (response.status === 200) {
        const cameraInfo = this.parseCameraInfo(response.data, response.headers);
        
        const camera = {
          id: `camera-${ip.replace(/\./g, '-')}`,
          ip: ip,
          port: 80,
          type: cameraInfo.type || 'Axis Camera',
          model: cameraInfo.model || 'Unknown Model',
          manufacturer: cameraInfo.manufacturer || 'Axis Communications',
          mac: await this.getMACAddress(ip),
          capabilities: cameraInfo.capabilities || ['ACAP', 'ONVIF', 'RTSP', 'HTTP'],
          discoveredAt: new Date().toISOString(),
          status: 'accessible',
          credentials: { username, password },
          rtspUrl: `rtsp://${username}:${password}@${ip}:554/axis-media/media.amp`,
          httpUrl: `http://${ip}`
        };
        
        console.log('Camera found:', camera);
        return camera;
      }
      
      return null;
    } catch (error) {
      console.error(`Error checking Axis camera at ${ip}:`, error.message);
      return null;
    }
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