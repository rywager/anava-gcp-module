// Debug script to see what's actually happening during validation
const ping = require('ping');
const axios = require('axios');
const crypto = require('crypto');

// Copy the exact validation logic from the app
async function debugValidation() {
  console.log('=== DEBUGGING VALIDATION FAILURE ===\n');
  
  const testIPs = ['192.168.50.156', '192.168.50.121', '192.168.50.125', '192.168.50.83'];
  
  for (const ip of testIPs) {
    console.log(`\n🔍 DEBUGGING ${ip}:`);
    
    // Step 1: Check if VAPIX endpoint responds
    try {
      const vapixCheck = await axios.get(`http://${ip}/axis-cgi/param.cgi`, {
        timeout: 3000,
        validateStatus: () => true
      });
      
      console.log(`  VAPIX endpoint status: ${vapixCheck.status}`);
      
      if (vapixCheck.status === 401 || vapixCheck.status === 200) {
        console.log('  ✅ VAPIX endpoint found - this should be detected as Axis device');
        
        // Step 2: Try digest auth to get detailed info
        try {
          const digestResult = await digestAuthDebug(ip, 'root', 'pass', '/axis-cgi/param.cgi?action=list&group=Brand');
          
          if (digestResult) {
            console.log('  ✅ Digest auth successful');
            console.log('  Response preview:', digestResult.substring(0, 200));
            
            if (digestResult.includes('Brand=AXIS')) {
              console.log('  ✅ Confirmed AXIS brand');
              
              const modelMatch = digestResult.match(/ProdNbr=([^\r\n]+)/);
              const typeMatch = digestResult.match(/ProdType=([^\r\n]+)/);
              
              console.log('  Model:', modelMatch ? modelMatch[1] : 'Not found');
              console.log('  Product Type:', typeMatch ? typeMatch[1] : 'Not found');
              
              const productType = typeMatch ? typeMatch[1] : '';
              const isCamera = !productType.toLowerCase().includes('speaker') && 
                             !productType.toLowerCase().includes('audio') &&
                             !productType.toLowerCase().includes('sound');
              
              console.log('  Is Camera (not speaker):', isCamera);
              
              if (isCamera) {
                console.log('  ✅ THIS SHOULD BE FULLY VALIDATED AS CAMERA');
              } else {
                console.log('  ❌ This is not a camera (speaker/audio device)');
              }
            } else {
              console.log('  ❌ Not an AXIS device (no Brand=AXIS in response)');
            }
          } else {
            console.log('  ❌ Digest auth failed');
          }
        } catch (authError) {
          console.log('  ❌ Digest auth error:', authError.message);
        }
      } else {
        console.log('  ❌ VAPIX endpoint not available');
      }
    } catch (error) {
      console.log('  ❌ VAPIX check failed:', error.message);
    }
  }
}

async function digestAuthDebug(ip, username, password, path) {
  try {
    // First request to get the digest challenge
    const response1 = await axios.get(`http://${ip}${path}`, {
      timeout: 5000,
      validateStatus: () => true
    });

    console.log(`    Digest auth step 1 - Status: ${response1.status}`);

    if (response1.status === 401) {
      const wwwAuth = response1.headers['www-authenticate'];
      console.log(`    WWW-Authenticate header: ${wwwAuth ? 'Present' : 'Missing'}`);
      
      if (wwwAuth && wwwAuth.includes('Digest')) {
        const digestData = parseDigestAuth(wwwAuth);
        const authHeader = buildDigestHeader(username, password, 'GET', path, digestData);
        
        console.log(`    Built digest header: ${authHeader.substring(0, 50)}...`);
        
        const response2 = await axios.get(`http://${ip}${path}`, {
          headers: { 'Authorization': authHeader },
          timeout: 5000
        });

        console.log(`    Digest auth step 2 - Status: ${response2.status}`);
        
        if (response2.status === 200) {
          return response2.data;
        }
      }
    }
  } catch (error) {
    console.log(`    Digest auth exception: ${error.message}`);
  }
  return null;
}

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

debugValidation().catch(console.error);