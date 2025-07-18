#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

console.log('OAuth Configuration Test\n');

// Check if oauth-config.json exists
const configPath = path.join(__dirname, 'oauth-config.json');

if (!fs.existsSync(configPath)) {
  console.error('❌ oauth-config.json not found!');
  console.log('\nPlease follow the instructions in OAUTH_SETUP.md to create this file.');
  process.exit(1);
}

// Read and validate the config
try {
  const configData = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configData);
  
  console.log('✅ oauth-config.json found and is valid JSON');
  
  // Check structure
  if (!config.installed) {
    console.error('❌ Missing "installed" section in config');
    process.exit(1);
  }
  
  const required = ['client_id', 'client_secret', 'redirect_uris'];
  const missing = required.filter(field => !config.installed[field]);
  
  if (missing.length > 0) {
    console.error(`❌ Missing required fields: ${missing.join(', ')}`);
    process.exit(1);
  }
  
  console.log('✅ All required fields present');
  
  // Check if it's the template or real credentials
  if (config.installed.client_id === 'YOUR_CLIENT_ID') {
    console.error('\n❌ Config still contains template values!');
    console.log('Please replace with your actual OAuth credentials from Google Cloud Console.');
    process.exit(1);
  }
  
  // Display config info (without secret)
  console.log('\nConfiguration:');
  console.log(`  Client ID: ${config.installed.client_id}`);
  console.log(`  Project ID: ${config.installed.project_id || 'Not specified'}`);
  console.log(`  Redirect URIs: ${config.installed.redirect_uris.join(', ')}`);
  console.log(`  Client Secret: ${config.installed.client_secret ? '[REDACTED]' : 'Missing!'}`);
  
  // Check redirect URI
  const expectedPort = 8085;
  const hasCorrectRedirect = config.installed.redirect_uris.some(uri => 
    uri.includes(`localhost:${expectedPort}`)
  );
  
  if (!hasCorrectRedirect) {
    console.warn(`\n⚠️  Warning: No redirect URI for localhost:${expectedPort}`);
    console.log('The app expects http://localhost:8085 as the redirect URI.');
    console.log('Current redirect URIs:', config.installed.redirect_uris);
  } else {
    console.log('\n✅ Redirect URI correctly configured');
  }
  
  console.log('\n✅ OAuth configuration appears to be properly set up!');
  console.log('\nYou can now run the app with: npm run dev');
  
} catch (error) {
  console.error('❌ Error reading oauth-config.json:', error.message);
  process.exit(1);
}