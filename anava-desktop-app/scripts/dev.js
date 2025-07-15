#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const net = require('net');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(colors[color] + message + colors.reset);
}

function runCommand(command, args, options = {}) {
  return spawn(command, args, {
    stdio: 'inherit',
    shell: true,
    ...options
  });
}

function checkPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on('error', () => resolve(false));
  });
}

async function waitForPort(port, timeout = 30000) {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const available = await checkPort(port);
    if (!available) {
      return true; // Port is in use, React dev server is running
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return false;
}

async function main() {
  log('🚀 Starting Anava Vision Desktop in development mode...', 'bright');
  
  // Start React dev server
  log('Starting React development server...', 'cyan');
  const reactProcess = runCommand('npm', ['start'], {
    cwd: path.join(__dirname, '..', 'src', 'renderer')
  });
  
  // Wait for React dev server to start
  log('Waiting for React dev server to start...', 'yellow');
  const reactStarted = await waitForPort(3000);
  
  if (!reactStarted) {
    log('❌ React dev server failed to start', 'red');
    process.exit(1);
  }
  
  log('✅ React dev server started on port 3000', 'green');
  
  // Start Electron
  log('Starting Electron...', 'cyan');
  const electronProcess = runCommand('electron', ['.'], {
    cwd: path.join(__dirname, '..')
  });
  
  // Handle process termination
  process.on('SIGINT', () => {
    log('\\n🛑 Shutting down development servers...', 'yellow');
    if (reactProcess) reactProcess.kill();
    if (electronProcess) electronProcess.kill();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    log('\\n🛑 Shutting down development servers...', 'yellow');
    if (reactProcess) reactProcess.kill();
    if (electronProcess) electronProcess.kill();
    process.exit(0);
  });
  
  // Handle child process exits
  reactProcess.on('close', (code) => {
    if (code !== 0) {
      log('❌ React dev server exited with code ' + code, 'red');
      process.exit(1);
    }
  });
  
  electronProcess.on('close', (code) => {
    log('Electron exited with code ' + code, 'yellow');
    if (reactProcess) reactProcess.kill();
    process.exit(0);
  });
  
  log('🎉 Development environment started successfully!', 'green');
  log('📱 React dev server: http://localhost:3000', 'cyan');
  log('⚡ Electron app should open automatically', 'cyan');
}

main().catch(error => {
  log('💥 Failed to start development environment: ' + error.message, 'red');
  process.exit(1);
});