const axios = require('axios');
const crypto = require('crypto');

// Digest auth helper functions
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

async function checkAxisEndpoints(ip, username, password) {
  try {
    console.log(`  - Checking Axis VAPIX endpoints for ${ip}...`);
    
    // Try with digest authentication
    const response = await digestAuth(ip, username, password, '/axis-cgi/param.cgi?action=list&group=Brand');
    
    if (response && response.includes('Brand=AXIS')) {
      console.log(`  ✅ Confirmed Axis device via VAPIX`);
      const modelMatch = response.match(/ProdNbr=([^\r\n]+)/);
      const typeMatch = response.match(/ProdType=([^\r\n]+)/);
      const productType = typeMatch ? typeMatch[1] : '';
      
      // Filter out non-camera Axis devices
      if (productType.toLowerCase().includes('speaker') || 
          productType.toLowerCase().includes('audio') ||
          productType.toLowerCase().includes('sound')) {
        console.log(`  ❌ Axis device is not a camera (${productType})`);
        return { isAxis: false };
      }
      
      console.log(`  ✅ Axis camera model: ${modelMatch ? modelMatch[1] : 'Unknown'}`);
      console.log(`  ✅ Product type: ${productType}`);
      return {
        isAxis: true,
        model: modelMatch ? modelMatch[1] : 'Unknown Axis Model',
        productType: productType,
        rtspUrl: `rtsp://${username}:${password}@${ip}:554/axis-media/media.amp`
      };
    }
  } catch (error) {
    console.log('Axis endpoint check error:', error.message);
  }
  return { isAxis: false };
}

async function testValidation() {
  console.log('=== TESTING FULL CAMERA VALIDATION ===\n');
  
  const devices = [
    { ip: '192.168.50.156', name: 'Axis Camera' },
    { ip: '192.168.50.121', name: 'Axis Speaker' },
    { ip: '192.168.50.125', name: 'Other Device' }
  ];
  
  for (const device of devices) {
    console.log(`\nTesting ${device.name} at ${device.ip}:`);
    
    // First check if VAPIX endpoint exists
    try {
      const vapixCheck = await axios.get(`http://${device.ip}/axis-cgi/param.cgi`, {
        timeout: 1000,
        validateStatus: () => true
      });
      
      if (vapixCheck.status === 401 || vapixCheck.status === 200) {
        console.log('  ✓ VAPIX endpoint found - this is an Axis device');
        
        // Now validate what kind of Axis device it is
        const validation = await checkAxisEndpoints(device.ip, 'root', 'pass');
        
        if (validation.isAxis) {
          console.log('  ✅ CONFIRMED: This is an Axis CAMERA');
          console.log('    Model:', validation.model);
          console.log('    RTSP URL:', validation.rtspUrl);
        } else {
          console.log('  ✅ CORRECTLY FILTERED: This is an Axis device but NOT a camera');
        }
      } else {
        console.log('  ❌ No VAPIX endpoint - not an Axis device');
      }
    } catch (e) {
      console.log('  ❌ No VAPIX endpoint - not an Axis device');
    }
  }
}

testValidation().then(() => {
  console.log('\n=== TEST COMPLETE ===');
  process.exit(0);
}).catch(console.error);