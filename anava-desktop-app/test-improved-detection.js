const axios = require('axios');

async function testImprovedDetection() {
  console.log('=== TESTING IMPROVED CAMERA DETECTION ===\n');
  
  const testIPs = [
    '192.168.50.156', // Your Axis camera
    '192.168.50.121', // Unknown device
    '192.168.50.125', // Another device
  ];
  
  for (const ip of testIPs) {
    console.log(`Testing ${ip}...`);
    
    // First check HTTP
    try {
      const response = await axios.get(`http://${ip}/`, {
        timeout: 2000,
        validateStatus: () => true
      });
      
      console.log(`  HTTP Status: ${response.status}`);
      console.log(`  Server: ${response.headers['server'] || 'none'}`);
      
      // Now check for Axis VAPIX endpoint
      try {
        const axisCheck = await axios.get(`http://${ip}/axis-cgi/param.cgi`, {
          timeout: 1000,
          validateStatus: () => true
        });
        
        console.log(`  ✅ AXIS DEVICE CONFIRMED! VAPIX endpoint returned: ${axisCheck.status}`);
        console.log(`  This WILL be detected as an Axis camera`);
      } catch (e) {
        console.log(`  ❌ Not an Axis device (no VAPIX endpoint)`);
        console.log(`  This will NOT be detected as a camera`);
      }
      
    } catch (error) {
      console.log(`  No HTTP server: ${error.message}`);
    }
    
    console.log('');
  }
}

testImprovedDetection().catch(console.error);