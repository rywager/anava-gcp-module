const axios = require('axios');
const crypto = require('crypto');
const https = require('https');

// Digest auth implementation
async function digestAuth(ip, username, password, method, uri, data = null, options = {}) {
  try {
    const url = `http://${ip}${uri}`;
    
    // First request to get digest challenge
    const firstRequest = {
      method,
      url,
      timeout: options.timeout || 10000,
      validateStatus: () => true,
      maxRedirects: 0
    };
    
    const response1 = await axios(firstRequest);
    
    if (response1.status === 401) {
      const authHeader = response1.headers['www-authenticate'];
      if (!authHeader || !authHeader.includes('Digest')) {
        throw new Error('Camera does not support digest authentication');
      }
      
      // Parse digest challenge
      const digestParams = {};
      const regex = /(\w+)=(?:"([^"]+)"|([^,]+))/g;
      let match;
      while ((match = regex.exec(authHeader))) {
        digestParams[match[1]] = match[2] || match[3];
      }
      
      // Generate digest response
      const nc = '00000001';
      const cnonce = crypto.randomBytes(8).toString('hex');
      
      const ha1 = crypto.createHash('md5')
        .update(`${username}:${digestParams.realm}:${password}`)
        .digest('hex');
      
      const ha2 = crypto.createHash('md5')
        .update(`${method}:${uri}`)
        .digest('hex');
      
      const response = crypto.createHash('md5')
        .update(`${ha1}:${digestParams.nonce}:${nc}:${cnonce}:${digestParams.qop}:${ha2}`)
        .digest('hex');
      
      const authorization = `Digest username="${username}", realm="${digestParams.realm}", ` +
        `nonce="${digestParams.nonce}", uri="${uri}", qop=${digestParams.qop}, ` +
        `nc=${nc}, cnonce="${cnonce}", response="${response}"`;
      
      // Second request with auth
      const secondRequest = {
        ...firstRequest,
        headers: {
          'Authorization': authorization,
          ...(options.headers || {})
        }
      };
      
      if (data) {
        secondRequest.data = data;
        if (options.contentType) {
          secondRequest.headers['Content-Type'] = options.contentType;
        }
      }
      
      const response2 = await axios(secondRequest);
      return response2;
    } else if (response1.status === 200) {
      // Already authenticated or no auth required
      return response1;
    } else {
      throw new Error(`Unexpected status: ${response1.status}`);
    }
  } catch (error) {
    console.error(`Digest auth error for ${uri}:`, error.message);
    
    // Try HTTPS as fallback
    if (!options.triedHttps) {
      console.log('Trying HTTPS...');
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });
      return digestAuth(ip.replace('http://', 'https://'), username, password, method, uri, data, {
        ...options,
        triedHttps: true,
        httpsAgent
      });
    }
    
    throw error;
  }
}

async function testACAPOperations() {
  console.log('=== TESTING ACAP OPERATIONS ===\n');
  
  const cameraIp = '192.168.50.156';
  const credentials = { username: 'root', password: 'pass' };
  
  try {
    // Test 1: List installed ACAPs
    console.log('1. Listing installed ACAPs...');
    const listResponse = await digestAuth(
      cameraIp,
      credentials.username,
      credentials.password,
      'GET',
      '/axis-cgi/applications/list.cgi',
      null,
      { timeout: 10000 }
    );
    
    console.log('Status:', listResponse.status);
    if (listResponse.status === 200) {
      console.log('Installed ACAPs:');
      const lines = listResponse.data.split('\n');
      lines.forEach(line => {
        if (line.trim()) {
          console.log('  -', line.trim());
        }
      });
    }
    
    // Test 2: Check control endpoint
    console.log('\n2. Testing ACAP control endpoint...');
    const controlResponse = await digestAuth(
      cameraIp,
      credentials.username,
      credentials.password,
      'POST',
      '/axis-cgi/applications/control.cgi',
      'package=testpackage&action=status',
      { 
        timeout: 10000,
        contentType: 'application/x-www-form-urlencoded'
      }
    );
    
    console.log('Control endpoint status:', controlResponse.status);
    if (controlResponse.data) {
      console.log('Response:', controlResponse.data.substring(0, 100));
    }
    
    // Test 3: Check upload endpoint availability
    console.log('\n3. Checking ACAP upload endpoint...');
    const uploadCheck = await digestAuth(
      cameraIp,
      credentials.username,
      credentials.password,
      'GET',
      '/axis-cgi/applications/upload.cgi',
      null,
      { timeout: 5000, validateStatus: () => true }
    );
    
    console.log('Upload endpoint status:', uploadCheck.status);
    console.log('Upload endpoint ready:', uploadCheck.status === 405 ? 'Yes (POST required)' : 'Check status');
    
  } catch (error) {
    console.error('ACAP test error:', error.message);
  }
}

testACAPOperations().then(() => {
  console.log('\n=== TEST COMPLETE ===');
  process.exit(0);
}).catch(console.error);