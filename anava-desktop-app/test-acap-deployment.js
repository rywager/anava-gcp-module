// Test script for ACAP deployment with digest auth
const ACAPDeploymentService = require('./src/main/services/acapDeployment');

async function testACAPDeployment() {
  const service = new ACAPDeploymentService();
  
  // Test parameters - update these as needed
  const cameraIp = '192.168.50.156';
  const credentials = { username: 'root', password: 'pass' };
  const acapFile = '/path/to/your/acap.eap'; // Update this path
  
  console.log('=== Testing ACAP Deployment ===');
  console.log(`Camera: ${cameraIp}`);
  console.log(`Credentials: ${credentials.username}:****`);
  
  try {
    // Test 1: Get current ACAP list
    console.log('\n1. Testing ACAP list with digest auth...');
    const response = await service.digestAuth(
      cameraIp,
      credentials.username,
      credentials.password,
      'GET',
      '/axis-cgi/applications/list.cgi',
      null,
      { timeout: 10000 }
    );
    
    console.log('Status:', response.status);
    console.log('Response:', response.data.substring(0, 200));
    
    // Test 2: Check a specific package status
    console.log('\n2. Testing package status check...');
    const status = await service.getACAPStatus(cameraIp, 'your-package-name', credentials);
    console.log('Package status:', status);
    
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

// Run the test
testACAPDeployment().then(() => {
  console.log('\n=== Test complete ===');
  process.exit(0);
}).catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});