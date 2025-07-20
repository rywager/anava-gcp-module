const ping = require('ping');
const axios = require('axios');

async function testActualDiscovery() {
  console.log('=== TESTING WHAT THE APP ACTUALLY FINDS ===\n');
  
  // Test what the current detection logic finds
  const testNetwork = '192.168.50.';
  const foundDevices = [];
  
  console.log('Scanning network 192.168.50.1-254...');
  
  // Scan the network like the app does
  for (let i = 1; i <= 254; i++) {
    const ip = `${testNetwork}${i}`;
    
    try {
      const pingResult = await ping.promise.probe(ip, {
        timeout: 1,
        min_reply: 1
      });
      
      if (pingResult.alive) {
        console.log(`\n📍 FOUND ALIVE DEVICE: ${ip}`);
        
        // Check if it has a web server
        try {
          const response = await axios.get(`http://${ip}/`, {
            timeout: 2000,
            validateStatus: () => true
          });
          
          const server = response.headers['server'] || 'No server header';
          console.log(`  HTTP Status: ${response.status}`);
          console.log(`  Server: ${server}`);
          
          // Check for VAPIX endpoint
          let hasVapix = false;
          try {
            const vapixCheck = await axios.get(`http://${ip}/axis-cgi/param.cgi`, {
              timeout: 1000,
              validateStatus: () => true
            });
            hasVapix = vapixCheck.status === 401 || vapixCheck.status === 200;
            console.log(`  VAPIX endpoint: ${hasVapix ? 'YES' : 'NO'} (${vapixCheck.status})`);
          } catch (e) {
            console.log(`  VAPIX endpoint: NO (error)`);
          }
          
          // Current detection logic
          const wouldDetect = hasVapix || 
            server.toLowerCase().includes('axis') || 
            server.toLowerCase().includes('camera') ||
            server.toLowerCase().includes('ipcam') ||
            server.toLowerCase().includes('hikvision') ||
            server.toLowerCase().includes('dahua') ||
            response.status === 401;
            
          console.log(`  🔍 WOULD BE DETECTED: ${wouldDetect ? 'YES' : 'NO'}`);
          
          if (wouldDetect) {
            foundDevices.push({
              ip,
              server,
              status: response.status,
              hasVapix,
              reason: hasVapix ? 'VAPIX endpoint' : 'Other criteria'
            });
            console.log(`  ✅ ADDED TO CAMERA LIST!`);
          }
          
        } catch (httpError) {
          console.log(`  No HTTP server`);
        }
      }
    } catch (pingError) {
      // Skip non-responsive IPs
    }
  }
  
  console.log('\n=== SUMMARY OF WHAT THE APP FINDS ===');
  console.log(`Total devices that would be detected as cameras: ${foundDevices.length}`);
  
  foundDevices.forEach((device, index) => {
    console.log(`\n${index + 1}. ${device.ip}`);
    console.log(`   Server: ${device.server}`);
    console.log(`   Status: ${device.status}`);
    console.log(`   Has VAPIX: ${device.hasVapix}`);
    console.log(`   Detected because: ${device.reason}`);
  });
  
  console.log('\n=== SPECIFIC DEVICE CHECKS ===');
  
  // Check your known camera
  console.log('\n📷 YOUR AXIS CAMERA (192.168.50.156):');
  const found156 = foundDevices.find(d => d.ip === '192.168.50.156');
  if (found156) {
    console.log('✅ DETECTED - Good!');
  } else {
    console.log('❌ NOT DETECTED - This is the problem!');
  }
  
  // Check for false positives
  console.log('\n🔍 FALSE POSITIVES:');
  foundDevices.forEach(device => {
    if (device.ip !== '192.168.50.156') {
      console.log(`❌ ${device.ip} - ${device.server} - This shouldn't be a camera`);
    }
  });
}

testActualDiscovery().catch(console.error);