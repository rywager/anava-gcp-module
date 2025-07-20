import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { Camera } from '../types';

const execAsync = promisify(exec);

// VAPIX API endpoints
const VAPIX_DEVICE_INFO = '/axis-cgi/basicdeviceinfo.cgi';
const VAPIX_PARAMS = '/axis-cgi/param.cgi?action=list';

export async function discoverCameras(): Promise<Camera[]> {
  console.log('Starting camera discovery...');
  
  // Use arp-scan or nmap to discover devices on the network
  const cameras: Camera[] = [];
  
  try {
    // Try to scan local network for Axis cameras
    // This is a simplified version - in production, use proper network scanning
    const subnets = ['192.168.1.0/24', '192.168.50.0/24', '10.0.0.0/24'];
    
    for (const subnet of subnets) {
      const discovered = await scanSubnet(subnet);
      cameras.push(...discovered);
    }
    
    // Also check known test camera
    const testCamera = await checkCamera('192.168.50.156', 'root', 'pass');
    if (testCamera) {
      cameras.push(testCamera);
    }
    
  } catch (error) {
    console.error('Error during discovery:', error);
  }
  
  return cameras;
}

async function scanSubnet(subnet: string): Promise<Camera[]> {
  const cameras: Camera[] = [];
  
  try {
    // Use ping sweep to find active hosts
    const { stdout } = await execAsync(`ping -c 1 -W 1 ${subnet.replace('/24', '.1')}`);
    
    // Extract IP addresses and check if they're Axis cameras
    // This is simplified - real implementation would parse network properly
    const baseIP = subnet.split('/')[0].split('.').slice(0, 3).join('.');
    
    // Check common IP ranges
    for (let i = 1; i <= 254; i++) {
      const ip = `${baseIP}.${i}`;
      const camera = await checkCamera(ip, 'root', 'pass');
      if (camera) {
        cameras.push(camera);
      }
    }
  } catch (error) {
    console.error(`Error scanning subnet ${subnet}:`, error);
  }
  
  return cameras;
}

async function checkCamera(ip: string, username: string, password: string): Promise<Camera | null> {
  try {
    // Try to get device info via VAPIX
    const response = await axios.get(`http://${ip}${VAPIX_DEVICE_INFO}`, {
      auth: {
        username,
        password
      },
      timeout: 2000
    });
    
    if (response.status === 200) {
      // Parse device info (simplified)
      const data = response.data;
      const lines = data.split('\\n');
      const info: any = {};
      
      lines.forEach((line: string) => {
        const [key, value] = line.split('=');
        if (key && value) {
          info[key.trim()] = value.trim();
        }
      });
      
      return {
        id: info.SerialNumber || ip,
        ip,
        model: info.ProdNbr || 'Unknown Axis Camera',
        serialNumber: info.SerialNumber || 'unknown',
        firmware: info.Version || 'unknown',
        discovered: new Date(),
        status: 'online'
      };
    }
  } catch (error) {
    // Not an Axis camera or not accessible
  }
  
  return null;
}

export async function getCameraDetails(ip: string, credentials: { username: string; password: string }): Promise<any> {
  try {
    const response = await axios.get(`http://${ip}${VAPIX_PARAMS}`, {
      auth: credentials,
      timeout: 5000
    });
    
    // Parse parameters
    const params: any = {};
    const lines = response.data.split('\\n');
    
    lines.forEach((line: string) => {
      if (line.includes('=')) {
        const [key, value] = line.split('=');
        params[key.trim()] = value.trim();
      }
    });
    
    return params;
  } catch (error) {
    console.error(`Error getting camera details for ${ip}:`, error);
    throw error;
  }
}