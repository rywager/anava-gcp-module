// Simple test to verify camera discovery works
const axios = require('axios');

async function testCameraDiscovery() {
  console.log('Testing camera discovery...');
  
  const testCamera = {
    ip: '192.168.50.156',
    username: 'root',
    password: 'pass'
  };
  
  try {
    console.log(`Attempting to connect to test camera at ${testCamera.ip}...`);
    
    const response = await axios.get(
      `http://${testCamera.ip}/axis-cgi/basicdeviceinfo.cgi`,
      {
        auth: {
          username: testCamera.username,
          password: testCamera.password
        },
        timeout: 5000
      }
    );
    
    if (response.status === 200) {
      console.log('✅ Successfully connected to test camera!');
      console.log('Camera info:');
      
      const lines = response.data.split('\n');
      lines.forEach(line => {
        if (line.includes('=')) {
          const [key, value] = line.split('=');
          if (key && value) {
            console.log(`  ${key.trim()}: ${value.trim()}`);
          }
        }
      });
      
      return true;
    }
  } catch (error) {
    console.log('❌ Failed to connect to test camera');
    if (error.code === 'ECONNREFUSED') {
      console.log('  → Camera not reachable (check network/IP)');
    } else if (error.response?.status === 401) {
      console.log('  → Authentication failed (check credentials)');
    } else {
      console.log(`  → Error: ${error.message}`);
    }
    return false;
  }
}

testCameraDiscovery().then(success => {
  if (success) {
    console.log('\n🎉 Camera discovery test passed! The application should be able to discover this camera.');
  } else {
    console.log('\n⚠️  Camera discovery test failed. The application may not find cameras on the network.');
  }
});