// Test the core camera discovery logic without electron
const ping = require('ping');
const axios = require('axios');
const crypto = require('crypto');

// Digest auth functions
function parseDigestAuth(authHeader) {
  const data = {};
  const regex = /(\w+)=(?:"([^"]+)"|([^,]+))/g;
  let match;
  
  while ((match = regex.exec(authHeader)) !== null) {
    data[match[1]] = match[2] || match[3];
  }
  
  return data;
}

function buildDigestHeader(username, password, method, uri, digestData) {
  const nc = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');
  
  const ha1 = crypto.createHash('md5').update(`${username}:${digestData.realm}:${password}`).digest('hex');
  const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
  const response = crypto.createHash('md5').update(`${ha1}:${digestData.nonce}:${nc}:${cnonce}:${digestData.qop}:${ha2}`).digest('hex');
  
  return `Digest username="${username}", realm="${digestData.realm}", nonce="${digestData.nonce}", uri="${uri}", qop=${digestData.qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
}

async function digestAuth(ip, username, password, path) {
  try {
    // First request to get the digest challenge
    const response1 = await axios.get(`http://${ip}${path}`, {
      timeout: 3000,
      validateStatus: () => true
    });

    if (response1.status === 401) {
      const wwwAuth = response1.headers['www-authenticate'];
      if (wwwAuth && wwwAuth.includes('Digest')) {
        const digestData = parseDigestAuth(wwwAuth);
        const authHeader = buildDigestHeader(username, password, 'GET', path, digestData);
        
        const response2 = await axios.get(`http://${ip}${path}`, {
          headers: { 'Authorization': authHeader },
          timeout: 3000,
          responseType: path.includes('image') || path.includes('jpg') ? 'arraybuffer' : 'text'
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

async function testCameraCredentials(ip, username, password) {
  try {
    console.log(`Testing credentials ${username}:${password} for ${ip}`);
    
    // Test with digest auth on a simple endpoint
    const result = await digestAuth(ip, username, password, '/axis-cgi/param.cgi?action=list&group=Brand');
    
    if (result && result.includes('Brand=AXIS')) {
      console.log(`✅ Credentials work for ${ip}`);
      return {
        success: true,
        authenticated: true,
        message: 'Authentication successful'
      };
    } else {
      console.log(`❌ Credentials failed for ${ip}`);
      return {
        success: false,
        authenticated: false,
        message: 'Authentication failed'
      };
    }
  } catch (error) {
    console.error(`Error testing credentials for ${ip}:`, error.message);
    return {
      success: false,
      authenticated: false,
      message: `Error: ${error.message}`
    };
  }
}

async function testFixes() {
  console.log('=== TESTING CREDENTIAL FIXES ===\n');
  
  const cameraIp = '192.168.50.156';
  const username = 'root';
  const password = 'pass';
  
  // Test 1: Check if camera is reachable
  console.log('1. Testing camera reachability...');
  const pingResult = await ping.promise.probe(cameraIp, {
    timeout: 5,
    min_reply: 1
  });
  
  console.log(`Ping result: ${pingResult.alive ? 'ALIVE' : 'DEAD'}`);
  
  if (!pingResult.alive) {
    console.log('❌ Camera is not reachable');
    return;
  }
  
  // Test 2: Test credentials
  console.log('\n2. Testing credentials...');
  const credentialResult = await testCameraCredentials(cameraIp, username, password);
  
  console.log('Credential test result:', credentialResult);
  
  // Test 3: Simulate camera object creation
  console.log('\n3. Simulating camera object creation...');
  const camera = {
    id: `camera-${cameraIp.replace(/\./g, '-')}`,
    ip: cameraIp,
    port: 80,
    type: 'Axis Camera',
    model: 'M3215-LVE',
    manufacturer: 'Axis Communications',
    capabilities: ['ACAP', 'VAPIX', 'HTTP', 'RTSP'],
    discoveredAt: new Date().toISOString(),
    status: credentialResult.authenticated ? 'accessible' : 'requires_auth',
    credentials: { username, password },
    authenticated: credentialResult.authenticated,
    needsValidation: false
  };
  
  console.log('Camera object created:', camera);
  
  // Test 4: Check ACAP deployment availability
  console.log('\n4. Testing ACAP deployment availability...');
  const acapAvailable = (camera.status === 'accessible' || camera.authenticated) && 
    camera.capabilities.includes('ACAP') &&
    camera.type !== 'Unknown Device' && 
    camera.manufacturer === 'Axis Communications' && 
    !camera.needsValidation;
  
  console.log('ACAP deployment available:', acapAvailable);
  
  if (acapAvailable) {
    console.log('✅ SUCCESS: Camera is available for ACAP deployment');
  } else {
    console.log('❌ FAIL: Camera is NOT available for ACAP deployment');
    console.log('   - Status/Auth check:', camera.status === 'accessible' || camera.authenticated);
    console.log('   - ACAP capability:', camera.capabilities.includes('ACAP'));
    console.log('   - Not Unknown Device:', camera.type !== 'Unknown Device');
    console.log('   - Is Axis:', camera.manufacturer === 'Axis Communications');
    console.log('   - Not needs validation:', !camera.needsValidation);
  }
  
  return camera;
}

testFixes().then(() => {
  console.log('\n=== TEST COMPLETE ===');
  process.exit(0);
}).catch(console.error);