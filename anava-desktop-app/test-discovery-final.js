const CameraDiscoveryService = require('./src/main/services/cameraDiscovery');

async function testDiscovery() {
  console.log('=== TESTING CAMERA DISCOVERY WITH IMPROVED DETECTION ===\n');
  
  const service = new CameraDiscoveryService();
  
  // Test 1: Quick scan the known Axis camera
  console.log('1. Quick scanning known Axis camera at 192.168.50.156...');
  const quickResult = await service.quickScanSpecificCamera('192.168.50.156', 'root', 'pass');
  
  if (quickResult.length > 0) {
    console.log('✅ SUCCESS! Found camera:');
    console.log('  - IP:', quickResult[0].ip);
    console.log('  - Type:', quickResult[0].type);
    console.log('  - Manufacturer:', quickResult[0].manufacturer);
    console.log('  - Model:', quickResult[0].model);
    console.log('  - Status:', quickResult[0].status);
    console.log('  - Authenticated:', quickResult[0].authenticated);
  } else {
    console.log('❌ FAILED to find camera');
  }
  
  // Test 2: Check what happens with non-camera devices
  console.log('\n2. Testing non-camera device at 192.168.50.125...');
  const nonCamera = await service.checkForCamera('192.168.50.125');
  if (nonCamera) {
    console.log('Found device:');
    console.log('  - IP:', nonCamera.ip);
    console.log('  - Manufacturer:', nonCamera.manufacturer);
    console.log('  - Needs validation:', nonCamera.needsValidation);
  } else {
    console.log('✅ Correctly ignored non-camera device');
  }
  
  // Test 3: Test the speaker device
  console.log('\n3. Testing Axis speaker at 192.168.50.121...');
  const speaker = await service.quickScanSpecificCamera('192.168.50.121', 'root', 'pass');
  if (speaker.length === 0) {
    console.log('✅ Correctly filtered out Axis speaker');
  } else {
    console.log('❌ ERROR: Speaker detected as camera');
  }
}

testDiscovery().then(() => {
  console.log('\n=== TEST COMPLETE ===');
  process.exit(0);
}).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});