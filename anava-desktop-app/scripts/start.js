#!/usr/bin/env node

const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

// Check if this is a development or production environment
const isDev = process.env.NODE_ENV === 'development' || !fs.existsSync(path.join(__dirname, '..', 'src', 'renderer', 'build'));

console.log('🚀 Starting Anava Vision Desktop...');

if (isDev) {
  console.log('📱 Development mode');
  
  // Start development environment
  exec('node scripts/dev.js', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });
} else {
  console.log('⚡ Production mode');
  
  // Start production application
  exec('electron .', {
    cwd: path.join(__dirname, '..'),
    stdio: 'inherit'
  });
}

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down Anava Vision Desktop...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down Anava Vision Desktop...');
  process.exit(0);
});