const axios = require('axios');
const ping = require('ping');

async function testActualNetwork() {
  console.log('=== TESTING ACTUAL DEVICES ON YOUR NETWORK ===');
  
  // Test known Axis camera
  console.log('\n1. Testing YOUR AXIS CAMERA at 192.168.50.156...');
  try {
    const pingResult = await ping.promise.probe('192.168.50.156', { timeout: 2 });
    console.log('Ping result:', pingResult.alive ? 'ALIVE' : 'DEAD');
    
    if (pingResult.alive) {
      try {
        const response = await axios.get('http://192.168.50.156/', { 
          timeout: 2000, 
          validateStatus: () => true 
        });
        console.log('HTTP Status:', response.status);
        console.log('Server header:', response.headers['server'] || 'NO SERVER HEADER');
        console.log('Content-Type:', response.headers['content-type'] || 'NO CONTENT TYPE');
        console.log('All headers:', Object.keys(response.headers).join(', '));
        
        console.log('\nWould current checkForCamera() detect this?', 
          response.headers['server']?.toLowerCase().includes('axis') || 
          response.headers['server']?.toLowerCase().includes('camera') ||
          response.status === 401 ? 'YES' : 'NO - THIS IS THE PROBLEM!');
      } catch (httpErr) {
        console.log('HTTP Error:', httpErr.message);
      }
    }
  } catch (err) {
    console.log('Ping Error:', err.message);
  }
  
  // Test other devices on the network
  const testIPs = ['192.168.50.121', '192.168.50.125', '192.168.50.1', '192.168.50.3'];
  
  for (const ip of testIPs) {
    console.log(`\n2. Testing device at ${ip}...`);
    try {
      const pingResult = await ping.promise.probe(ip, { timeout: 1 });
      if (pingResult.alive) {
        console.log('Device is alive, checking HTTP...');
        try {
          const response = await axios.get(`http://${ip}/`, { 
            timeout: 2000, 
            validateStatus: () => true 
          });
          console.log('HTTP Status:', response.status);
          console.log('Server header:', response.headers['server'] || 'NO SERVER HEADER');
          
          const wouldDetect = response.headers['server']?.toLowerCase().includes('axis') || 
            response.headers['server']?.toLowerCase().includes('camera') ||
            response.headers['server']?.toLowerCase().includes('ipcam') ||
            response.status === 401;
            
          console.log('Would current logic detect this?', wouldDetect ? 'YES - THIS IS BAD!' : 'NO');
          
          if (wouldDetect && !response.headers['server']?.toLowerCase().includes('axis')) {
            console.log('⚠️  WARNING: Non-camera device would be detected!');
          }
        } catch (httpErr) {
          console.log('No HTTP server');
        }
      } else {
        console.log('Device not responding to ping');
      }
    } catch (err) {
      console.log('Error:', err.message);
    }
  }
  
  console.log('\n=== SUMMARY ===');
  console.log('The problem is likely that the Axis camera at 192.168.50.156:');
  console.log('1. Is not returning an "axis" server header');
  console.log('2. Is not returning 401 status on initial request');
  console.log('3. Our detection logic is too restrictive');
}

testActualNetwork().catch(console.error);