// Test script to verify camera authentication works
const axios = require('axios');
const crypto = require('crypto');

async function testCamera(ip, username, password) {
  console.log(`\n=== Testing camera at ${ip} ===`);
  console.log(`Credentials: ${username}:${password}`);
  
  // Test 1: Basic connection
  try {
    console.log('\n1. Testing basic HTTP connection...');
    const response = await axios.get(`http://${ip}/`, {
      timeout: 3000,
      validateStatus: () => true
    });
    console.log(`   Status: ${response.status}`);
    console.log(`   Headers:`, response.headers);
    
    if (response.status === 401) {
      console.log('   -> Requires authentication');
      const authHeader = response.headers['www-authenticate'];
      console.log(`   Auth type: ${authHeader}`);
    }
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }
  
  // Test 2: Axis VAPIX API with digest auth
  try {
    console.log('\n2. Testing Axis VAPIX API...');
    const endpoint = '/axis-cgi/param.cgi?action=list&group=Brand';
    
    // First request to get digest challenge
    const response1 = await axios.get(`http://${ip}${endpoint}`, {
      timeout: 3000,
      validateStatus: () => true
    });
    
    if (response1.status === 401 && response1.headers['www-authenticate']) {
      const wwwAuth = response1.headers['www-authenticate'];
      if (wwwAuth.includes('Digest')) {
        console.log('   Digest auth required, attempting...');
        
        // Parse digest parameters
        const digestData = {};
        const regex = /(\w+)=(?:"([^"]+)"|([^,]+))/g;
        let match;
        while ((match = regex.exec(wwwAuth)) !== null) {
          digestData[match[1]] = match[2] || match[3];
        }
        
        // Build digest response
        const nc = '00000001';
        const cnonce = crypto.randomBytes(8).toString('hex');
        const ha1 = crypto.createHash('md5').update(`${username}:${digestData.realm}:${password}`).digest('hex');
        const ha2 = crypto.createHash('md5').update(`GET:${endpoint}`).digest('hex');
        const response = crypto.createHash('md5').update(`${ha1}:${digestData.nonce}:${nc}:${cnonce}:${digestData.qop}:${ha2}`).digest('hex');
        
        const authHeader = `Digest username="${username}", realm="${digestData.realm}", nonce="${digestData.nonce}", uri="${endpoint}", qop=${digestData.qop}, nc=${nc}, cnonce="${cnonce}", response="${response}"`;
        
        // Second request with auth
        const response2 = await axios.get(`http://${ip}${endpoint}`, {
          headers: { 'Authorization': authHeader },
          timeout: 3000
        });
        
        console.log(`   Status: ${response2.status}`);
        if (response2.status === 200) {
          console.log('   ✅ Authentication successful!');
          console.log('   Response:', response2.data.substring(0, 200));
          
          // Check if it's actually an Axis camera
          if (response2.data.includes('Brand=AXIS')) {
            console.log('   ✅ Confirmed: This is an Axis camera!');
            const modelMatch = response2.data.match(/ProdNbr=([^\r\n]+)/);
            if (modelMatch) {
              console.log(`   Model: ${modelMatch[1]}`);
            }
            return true;
          } else {
            console.log('   ❌ Not an Axis camera');
          }
        }
      }
    }
  } catch (error) {
    console.log(`   Error: ${error.message}`);
  }
  
  // Test 3: Check common camera endpoints
  console.log('\n3. Testing camera-specific endpoints...');
  const endpoints = [
    '/axis-cgi/mjpg/video.cgi',
    '/axis-cgi/jpg/image.cgi',
    '/mjpeg',
    '/snapshot.jpg'
  ];
  
  for (const endpoint of endpoints) {
    try {
      const response = await axios.get(`http://${ip}${endpoint}`, {
        auth: { username, password },
        timeout: 2000,
        validateStatus: () => true,
        maxRedirects: 0,
        responseType: 'arraybuffer' // Get actual data
      });
      
      const contentType = response.headers['content-type'] || 'no content-type';
      console.log(`   ${endpoint}: ${response.status} (${contentType})`);
      
      if (response.status === 200) {
        // Check if it's actual image/video data
        if (contentType.includes('image') || contentType.includes('video')) {
          console.log(`   ✅ Found working camera endpoint!`);
          // Check if data looks like an image (JPEG starts with FFD8)
          if (response.data && response.data.length > 2) {
            const header = response.data.slice(0, 2).toString('hex');
            if (header === 'ffd8') {
              console.log(`   ✅ Confirmed: Valid JPEG image data`);
            }
          }
        } else if (contentType.includes('text/html')) {
          console.log(`   ❌ Returns HTML, not camera data`);
        }
      }
    } catch (error) {
      console.log(`   ${endpoint}: Error - ${error.message}`);
    }
  }
  
  return false;
}

// Test your camera
testCamera('192.168.50.156', 'root', 'pass').then(result => {
  console.log('\n=== Test complete ===');
});

// Also test the device at .125 that shows as camera in UI
testCamera('192.168.50.125', 'root', 'pass').then(result => {
  console.log('\n=== Test complete ===');
});