const ping = require('ping');
const axios = require('axios');
const crypto = require('crypto');

async function checkForCamera(ip) {
  try {
    // First, ping the IP to see if it's alive
    const pingResult = await ping.promise.probe(ip, {
      timeout: 2,
      min_reply: 1
    });
    
    if (!pingResult.alive) {
      return null;
    }
    
    console.log(`Checking device at ${ip}...`);
    
    // Check if it has a web server
    try {
      const response = await axios.get(`http://${ip}/`, {
        timeout: 2000,
        validateStatus: () => true
      });
      
      if (response.status === 200 || response.status === 401) {
        // Quick check for Axis-specific endpoints to determine if it's likely a camera
        let isLikelyCamera = false;
        let manufacturer = 'Unknown';
        
        // Check for Axis VAPIX endpoint
        try {
          const axisCheck = await axios.get(`http://${ip}/axis-cgi/param.cgi`, {
            timeout: 1000,
            validateStatus: () => true
          });
          
          if (axisCheck.status === 401 || axisCheck.status === 200) {
            // This is definitely an Axis device
            isLikelyCamera = true;
            manufacturer = 'Axis Communications';
            console.log(`  ✓ Found Axis device at ${ip} (VAPIX endpoint responded)`);
          }
        } catch (e) {
          // Not an Axis device, check other indicators
          const server = response.headers['server'] || '';
          const contentType = response.headers['content-type'] || '';
          
          // Check if it might be a camera based on other factors
          if (server.toLowerCase().includes('camera') ||
              server.toLowerCase().includes('ipcam') ||
              server.toLowerCase().includes('hikvision') ||
              server.toLowerCase().includes('dahua') ||
              response.status === 401) {
            isLikelyCamera = true;
          }
        }
        
        if (isLikelyCamera) {
          return {
            id: `camera-${ip.replace(/\./g, '-')}`,
            ip: ip,
            port: 80,
            type: 'Unknown Device',
            model: 'Unknown',
            manufacturer: manufacturer,
            capabilities: ['HTTP'],
            discoveredAt: new Date().toISOString(),
            status: 'requires_auth',
            needsValidation: true
          };
        }
      }
    } catch (error) {
      // No web server or error
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

async function testDetection() {
  console.log('=== TESTING IMPROVED CAMERA DETECTION ===\n');
  
  const testIPs = [
    '192.168.50.156', // Your Axis camera
    '192.168.50.121', // Axis speaker
    '192.168.50.125', // Other device
  ];
  
  for (const ip of testIPs) {
    console.log(`\nTesting ${ip}:`);
    const result = await checkForCamera(ip);
    
    if (result) {
      console.log('✅ DETECTED as camera:');
      console.log('  - Manufacturer:', result.manufacturer);
      console.log('  - Status:', result.status);
    } else {
      console.log('❌ NOT detected as camera');
    }
  }
}

testDetection().then(() => {
  console.log('\n=== TEST COMPLETE ===');
  process.exit(0);
}).catch(console.error);