// Test the validation fix - simulate what network scan should do
const ping = require('ping');
const axios = require('axios');
const crypto = require('crypto');

class TestCameraDiscovery {
  async checkForCamera(ip) {
    try {
      // Simulate the basic detection logic
      const pingResult = await ping.promise.probe(ip, {
        timeout: 2,
        min_reply: 1
      });
      
      if (!pingResult.alive) {
        return null;
      }
      
      console.log(`Checking device at ${ip}...`);
      
      const response = await axios.get(`http://${ip}/`, {
        timeout: 2000,
        validateStatus: () => true
      });
      
      if (response.status === 200 || response.status === 401) {
        let isLikelyCamera = false;
        let manufacturer = 'Unknown';
        
        // Check for Axis VAPIX endpoint
        try {
          const axisCheck = await axios.get(`http://${ip}/axis-cgi/param.cgi`, {
            timeout: 1000,
            validateStatus: () => true
          });
          
          if (axisCheck.status === 401 || axisCheck.status === 200) {
            isLikelyCamera = true;
            manufacturer = 'Axis Communications';
            console.log(`  ✓ Found Axis device at ${ip} (VAPIX endpoint responded)`);
          }
        } catch (e) {
          // Check other indicators...
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
            needsValidation: true  // THIS IS THE KEY!
          };
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  async checkAxisCamera(ip, username, password) {
    try {
      console.log(`=== Validating Axis camera at ${ip} ===`);
      
      // Test digest auth
      const result = await this.digestAuth(ip, username, password, '/axis-cgi/param.cgi?action=list&group=Brand');
      
      if (result && result.includes('Brand=AXIS')) {
        const modelMatch = result.match(/ProdNbr=([^\r\n]+)/);
        const typeMatch = result.match(/ProdType=([^\r\n]+)/);
        const productType = typeMatch ? typeMatch[1] : '';
        
        // Filter out speakers
        if (productType.toLowerCase().includes('speaker') || 
            productType.toLowerCase().includes('audio')) {
          console.log(`  ❌ Axis device is not a camera (${productType})`);
          return null;
        }
        
        console.log(`  ✅ Validated as Axis camera: ${modelMatch ? modelMatch[1] : 'Unknown'}`);
        
        return {
          id: `camera-${ip.replace(/\./g, '-')}`,
          ip: ip,
          port: 80,
          type: 'Axis Camera',
          model: modelMatch ? modelMatch[1] : 'Unknown Axis Model',
          manufacturer: 'Axis Communications',
          capabilities: ['ACAP', 'VAPIX', 'HTTP', 'RTSP'],
          discoveredAt: new Date().toISOString(),
          status: 'accessible',  // Should be accessible after validation
          authenticated: true,
          needsValidation: false,
          credentials: { username, password }
        };
      }
      
      return null;
    } catch (error) {
      console.error(`Error validating ${ip}:`, error.message);
      return null;
    }
  }

  async digestAuth(ip, username, password, path) {
    try {
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
      console.log(`Digest auth error for ${ip}:`, error.message);
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
}

async function testValidationFix() {
  console.log('=== TESTING VALIDATION FIX ===\n');
  
  const discovery = new TestCameraDiscovery();
  const testIPs = ['192.168.50.156', '192.168.50.121'];
  
  for (const ip of testIPs) {
    console.log(`\n🔍 Testing ${ip}:`);
    
    // Step 1: Basic detection (what network scan does)
    const detected = await discovery.checkForCamera(ip);
    
    if (detected) {
      console.log('✅ Detected as Axis device (basic scan)');
      console.log('   - Type:', detected.type);
      console.log('   - Manufacturer:', detected.manufacturer);
      console.log('   - Needs validation:', detected.needsValidation);
      
      // Step 2: Validation (what should happen automatically now)
      if (detected.manufacturer === 'Axis Communications' && detected.needsValidation) {
        console.log('\n🔍 Now validating device...');
        
        const validated = await discovery.checkAxisCamera(ip, 'root', 'pass');
        
        if (validated) {
          console.log('✅ VALIDATION SUCCESS!');
          console.log('   - Type:', validated.type);
          console.log('   - Model:', validated.model);
          console.log('   - Capabilities:', validated.capabilities);
          console.log('   - Status:', validated.status);
          console.log('   - Authenticated:', validated.authenticated);
          console.log('   - Available for ACAP:', validated.capabilities.includes('ACAP'));
        } else {
          console.log('❌ Validation failed');
        }
      }
    } else {
      console.log('❌ Not detected as camera');
    }
  }
}

testValidationFix().catch(console.error);