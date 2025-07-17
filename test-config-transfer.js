#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

async function testConfigTransfer() {
  console.log('=== Testing Terraform Configuration Transfer ===\n');
  
  // Load the configuration
  const configPath = path.join(__dirname, 'anava-desktop-app/terraform-outputs-real.json');
  const outputs = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  
  // Extract configuration
  const config = {
    apiGatewayUrl: outputs.api_gateway_url?.value || '',
    apiKey: outputs.api_gateway_key?.value || '',
    deviceAuthUrl: outputs.device_auth_url?.value || '',
    tvmUrl: outputs.tvm_url?.value || '',
    firebaseConfig: outputs.firebase_config?.value || {},
    serviceAccounts: outputs.service_accounts?.value || {},
    storageBuckets: outputs.storage_buckets?.value || {},
    wifProvider: outputs.wif_provider?.value || ''
  };
  
  console.log('Loaded configuration:');
  console.log('- API Gateway URL:', config.apiGatewayUrl);
  console.log('- API Key:', config.apiKey ? '***' + config.apiKey.slice(-8) : 'Not found');
  console.log('- Device Auth URL:', config.deviceAuthUrl);
  console.log('- TVM URL:', config.tvmUrl);
  console.log('- Firebase Project:', config.firebaseConfig.projectId);
  console.log('\n');
  
  // Test the API Gateway endpoint
  console.log('Testing API Gateway endpoint...');
  try {
    const response = await fetch(config.apiGatewayUrl + '/', {
      headers: {
        'x-api-key': config.apiKey
      }
    });
    console.log('API Gateway Response:', response.status, response.statusText);
    if (response.ok) {
      const data = await response.text();
      console.log('Response body:', data.substring(0, 100) + '...');
    }
  } catch (error) {
    console.error('API Gateway test failed:', error.message);
  }
  
  // Show the payload that would be sent to camera
  console.log('\n=== Configuration Payload for Camera ===\n');
  const payload = {
    command: 'setTerraformConfig',
    config: config
  };
  
  console.log(JSON.stringify(payload, null, 2));
  
  console.log('\n=== Test Complete ===');
  console.log('\nTo send this to a camera, the Electron app would POST to:');
  console.log('http://<camera-ip>/local/BatonAnalytic/baton_analytic.cgi');
  console.log('\nThe camera endpoint (AppApi.cpp) will:');
  console.log('1. Receive the configuration');
  console.log('2. Validate all required fields');
  console.log('3. Store in ParamManager');
  console.log('4. Trigger Gemini::reloadConfiguration()');
}

testConfigTransfer().catch(console.error);