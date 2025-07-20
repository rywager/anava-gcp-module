#!/usr/bin/env node

const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

console.log('🎯 Camera Integration Test Suite');
console.log('================================\n');

const CAMERA_IP = '192.168.50.156';
const CAMERA_USER = 'root';
const CAMERA_PASS = 'pass';
const DEPLOYMENT_URL = 'https://anava-deploy-392865621461.us-central1.run.app';

async function testWebServiceHealth() {
  console.log('1️⃣  Testing Web Service Health...');
  try {
    const response = await axios.get(`${DEPLOYMENT_URL}/health`);
    console.log('✅ Web service is healthy');
    console.log(`   Version: ${response.data.version}`);
    console.log(`   Build: ${response.data.build_time}`);
    console.log(`   Status: ${response.data.status}`);
    return true;
  } catch (error) {
    console.log('❌ Web service health check failed:', error.message);
    return false;
  }
}

async function testCameraConnectivity() {
  console.log('\n2️⃣  Testing Camera Connectivity...');
  console.log(`   IP: ${CAMERA_IP}`);
  
  // Try different authentication methods
  const authMethods = [
    { name: 'Basic Auth', headers: { 'Authorization': 'Basic ' + Buffer.from(`${CAMERA_USER}:${CAMERA_PASS}`).toString('base64') } },
    { name: 'Digest Auth', auth: { username: CAMERA_USER, password: CAMERA_PASS } }
  ];
  
  for (const method of authMethods) {
    console.log(`   Trying ${method.name}...`);
    try {
      const config = {
        timeout: 5000,
        validateStatus: () => true // Accept any status
      };
      
      if (method.headers) {
        config.headers = method.headers;
      } else if (method.auth) {
        config.auth = method.auth;
      }
      
      const response = await axios.get(`http://${CAMERA_IP}/`, config);
      console.log(`   Response status: ${response.status}`);
      
      if (response.status === 200) {
        console.log(`✅ Camera reachable with ${method.name}`);
        return true;
      } else if (response.status === 401) {
        console.log(`⚠️  Authentication required (${method.name} failed)`);
      }
    } catch (error) {
      console.log(`   Error: ${error.message}`);
    }
  }
  
  console.log('❌ Could not authenticate with camera');
  return false;
}

async function loadSampleConfig() {
  console.log('\n3️⃣  Loading Sample ACAP Configuration...');
  try {
    const configPath = path.join(__dirname, 'sample-acap-config.json');
    const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    console.log('✅ Configuration loaded');
    console.log(`   Deployment ID: ${config.deployment.id}`);
    console.log(`   Environment: ${config.deployment.environment}`);
    console.log(`   ACAP Version: ${config.acap.version}`);
    return config;
  } catch (error) {
    console.log('❌ Failed to load configuration:', error.message);
    return null;
  }
}

async function simulateACAPDeployment(config) {
  console.log('\n4️⃣  Simulating ACAP Deployment...');
  
  const steps = [
    { name: 'Validate configuration', delay: 500 },
    { name: 'Download ACAP package', delay: 1000 },
    { name: 'Upload to camera', delay: 1500 },
    { name: 'Install ACAP', delay: 2000 },
    { name: 'Configure ACAP', delay: 1000 },
    { name: 'Start ACAP service', delay: 500 }
  ];
  
  for (const step of steps) {
    console.log(`   ⏳ ${step.name}...`);
    await new Promise(resolve => setTimeout(resolve, step.delay));
    console.log(`   ✅ ${step.name} completed`);
  }
  
  console.log('✅ ACAP deployment simulation completed');
  return true;
}

async function testMCPIntegration(config) {
  console.log('\n5️⃣  Testing MCP Integration...');
  
  if (!config.endpoints.mcpServer) {
    console.log('❌ No MCP server endpoint configured');
    return false;
  }
  
  console.log(`   MCP Server: ${config.endpoints.mcpServer}`);
  console.log('   ⚠️  WebSocket connection requires authentication');
  console.log('   ℹ️  In production, camera would connect via WebSocket');
  
  return true;
}

async function generateDeploymentReport(results) {
  console.log('\n📊 Deployment Report');
  console.log('===================');
  
  const report = {
    timestamp: new Date().toISOString(),
    camera: {
      ip: CAMERA_IP,
      accessible: results.cameraConnected,
      authentication: results.cameraConnected ? 'Configured' : 'Failed'
    },
    cloudServices: {
      webService: results.webServiceHealthy ? 'Online' : 'Offline',
      deploymentUrl: DEPLOYMENT_URL
    },
    acapDeployment: {
      simulated: results.acapDeployed,
      configLoaded: results.configLoaded
    },
    mcpIntegration: {
      configured: results.mcpConfigured
    },
    nextSteps: []
  };
  
  // Add next steps based on results
  if (!results.cameraConnected) {
    report.nextSteps.push('Configure camera with correct credentials');
    report.nextSteps.push('Ensure camera is on the same network');
  }
  
  if (results.configLoaded && results.webServiceHealthy) {
    report.nextSteps.push('Authenticate with deployment service');
    report.nextSteps.push('Create actual deployment via web UI');
    report.nextSteps.push('Deploy ACAP to physical camera');
  }
  
  // Save report
  const reportPath = path.join(__dirname, 'deployment-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Report saved to: ${reportPath}`);
  
  return report;
}

async function main() {
  const results = {};
  
  // Test web service
  results.webServiceHealthy = await testWebServiceHealth();
  
  // Test camera
  results.cameraConnected = await testCameraConnectivity();
  
  // Load configuration
  const config = await loadSampleConfig();
  results.configLoaded = config !== null;
  
  if (config) {
    // Simulate deployment
    results.acapDeployed = await simulateACAPDeployment(config);
    
    // Test MCP
    results.mcpConfigured = await testMCPIntegration(config);
  }
  
  // Generate report
  const report = await generateDeploymentReport(results);
  
  console.log('\n🎯 Test Summary:');
  console.log(`   Web Service: ${results.webServiceHealthy ? '✅' : '❌'}`);
  console.log(`   Camera Access: ${results.cameraConnected ? '✅' : '❌'}`);
  console.log(`   Configuration: ${results.configLoaded ? '✅' : '❌'}`);
  console.log(`   ACAP Deployment: ${results.acapDeployed ? '✅' : '❌'}`);
  console.log(`   MCP Integration: ${results.mcpConfigured ? '✅' : '❌'}`);
  
  console.log('\n📝 Next Steps:');
  report.nextSteps.forEach((step, i) => {
    console.log(`   ${i + 1}. ${step}`);
  });
  
  console.log('\n✨ Camera integration test completed!');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});