const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function runE2ETest() {
  console.log('=== E2E TEST: ACTUAL ELECTRON APP BEHAVIOR ===\n');
  
  const logFile = path.join(os.homedir(), '.anava-vision', 'logs', `app-${new Date().toISOString().split('T')[0]}.log`);
  
  // Clear existing log
  if (fs.existsSync(logFile)) {
    fs.unlinkSync(logFile);
  }
  
  console.log('Starting Electron app...');
  
  // Start the Electron app
  const electronProcess = spawn('npm', ['start'], {
    cwd: __dirname,
    stdio: 'pipe'
  });
  
  let appOutput = '';
  
  electronProcess.stdout.on('data', (data) => {
    const output = data.toString();
    appOutput += output;
    console.log('APP OUTPUT:', output);
  });
  
  electronProcess.stderr.on('data', (data) => {
    const output = data.toString();
    appOutput += output;
    console.log('APP ERROR:', output);
  });
  
  // Wait for app to start
  await new Promise(resolve => setTimeout(resolve, 10000));
  
  console.log('\n=== APP STARTED, CHECKING LOGS ===');
  
  // Check if log file exists
  if (fs.existsSync(logFile)) {
    console.log('✅ Log file exists');
    const logs = fs.readFileSync(logFile, 'utf8');
    console.log('LOG CONTENTS:\n', logs);
  } else {
    console.log('❌ No log file found');
  }
  
  // Kill the app
  electronProcess.kill();
  
  console.log('\n=== FULL APP OUTPUT ===');
  console.log(appOutput);
}

runE2ETest().catch(console.error);