#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 Anava Desktop App Complete Flow Test\n');

const tests = [];

// Test 1: OAuth Configuration
tests.push({
  name: 'OAuth Configuration',
  test: () => {
    const configPath = path.join(__dirname, 'oauth-config.json');
    
    if (!fs.existsSync(configPath)) {
      return { pass: false, message: 'oauth-config.json not found' };
    }
    
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      
      if (!config.installed) {
        return { pass: false, message: 'Invalid config structure' };
      }
      
      if (config.installed.client_id === 'YOUR_CLIENT_ID') {
        return { pass: false, message: 'Config contains template values' };
      }
      
      return { pass: true, message: 'Valid OAuth configuration' };
    } catch (error) {
      return { pass: false, message: `Config parse error: ${error.message}` };
    }
  }
});

// Test 2: Node Modules
tests.push({
  name: 'Dependencies Installed',
  test: () => {
    const nodeModules = path.join(__dirname, 'node_modules');
    const rendererModules = path.join(__dirname, 'src/renderer/node_modules');
    
    if (!fs.existsSync(nodeModules)) {
      return { pass: false, message: 'Main node_modules not found' };
    }
    
    if (!fs.existsSync(rendererModules)) {
      return { pass: false, message: 'Renderer node_modules not found' };
    }
    
    // Check critical dependencies
    const criticalDeps = [
      'electron',
      'google-auth-library',
      'googleapis',
      'electron-store'
    ];
    
    for (const dep of criticalDeps) {
      if (!fs.existsSync(path.join(nodeModules, dep))) {
        return { pass: false, message: `Missing dependency: ${dep}` };
      }
    }
    
    return { pass: true, message: 'All dependencies installed' };
  }
});

// Test 3: Terraform Module
tests.push({
  name: 'Terraform Module',
  test: () => {
    const terraformModule = path.join(__dirname, 'terraform-module');
    
    if (!fs.existsSync(terraformModule)) {
      return { pass: false, message: 'terraform-module directory not found' };
    }
    
    const requiredFiles = ['main.tf', 'variables.tf', 'outputs.tf'];
    const missingFiles = requiredFiles.filter(file => 
      !fs.existsSync(path.join(terraformModule, file))
    );
    
    if (missingFiles.length > 0) {
      return { pass: false, message: `Missing files: ${missingFiles.join(', ')}` };
    }
    
    return { pass: true, message: 'Terraform module complete' };
  }
});

// Test 4: Application Data Clean
tests.push({
  name: 'Clean Application State',
  test: () => {
    const appDataPaths = [
      path.join(process.env.HOME, 'Library/Application Support/anava-vision-desktop'),
      path.join(process.env.HOME, '.anava-vision')
    ];
    
    const existingPaths = appDataPaths.filter(p => fs.existsSync(p));
    
    if (existingPaths.length > 0) {
      return { 
        pass: false, 
        message: `Found existing app data at: ${existingPaths.join(', ')}. Run: rm -rf "${existingPaths.join('" "')}"`
      };
    }
    
    return { pass: true, message: 'No existing app data found' };
  }
});

// Test 5: Build Status
tests.push({
  name: 'Build Artifacts',
  test: () => {
    const buildPath = path.join(__dirname, 'src/renderer/build');
    
    if (!fs.existsSync(buildPath)) {
      return { 
        pass: false, 
        message: 'Renderer not built. Run: npm run build-renderer' 
      };
    }
    
    return { pass: true, message: 'Build artifacts found' };
  }
});

// Run all tests
console.log('Running pre-flight checks...\n');

let allPassed = true;

tests.forEach((test, index) => {
  const result = test.test();
  const icon = result.pass ? '✅' : '❌';
  
  console.log(`${icon} ${test.name}`);
  console.log(`   ${result.message}`);
  
  if (!result.pass) {
    allPassed = false;
  }
  
  console.log('');
});

if (!allPassed) {
  console.log('❌ Some tests failed. Please fix the issues above before running the app.\n');
  process.exit(1);
}

console.log('✅ All tests passed!\n');

// Workflow test
console.log('📋 Workflow Test Checklist:\n');

const workflowSteps = [
  {
    step: 1,
    name: 'Authentication',
    checks: [
      'App starts at login screen (not step 2)',
      'Google login button opens system browser',
      'Can paste password in browser',
      'Returns to app after successful login',
      'Shows correct user email'
    ]
  },
  {
    step: 2,
    name: 'Project Selection',
    checks: [
      'Shows list of GCP projects',
      'Can select a project',
      'Selected project is saved',
      'Continue button enables after selection'
    ]
  },
  {
    step: 3,
    name: 'ACAP Deployment',
    checks: [
      'Shows ACAP deployment placeholder',
      'Can skip this step',
      'Navigation works correctly'
    ]
  },
  {
    step: 4,
    name: 'Infrastructure Deployment',
    checks: [
      'Deploy button is visible',
      'Progress shows during deployment',
      'Tasks update in real-time',
      'Logs can be viewed',
      'Errors are clearly displayed',
      'Success message appears when complete'
    ]
  },
  {
    step: 5,
    name: 'Camera Configuration',
    checks: [
      'Configuration loads correctly',
      'API Gateway URL is shown',
      'Can copy configuration values',
      'Send to camera dialog works',
      'Test commands are provided'
    ]
  },
  {
    step: 6,
    name: 'Completion',
    checks: [
      'Shows deployment summary',
      'All services marked as active',
      'Next steps are clear'
    ]
  }
];

workflowSteps.forEach(step => {
  console.log(`Step ${step.step}: ${step.name}`);
  step.checks.forEach(check => {
    console.log(`   [ ] ${check}`);
  });
  console.log('');
});

console.log('\n🚀 Ready to test! Run the app with:\n');
console.log('   npm run dev\n');
console.log('Then work through each step in the checklist above.\n');

// Optional: Auto-start the app
if (process.argv.includes('--start')) {
  console.log('Starting the app...\n');
  const app = spawn('npm', ['run', 'dev'], {
    cwd: __dirname,
    stdio: 'inherit'
  });
  
  app.on('error', (error) => {
    console.error('Failed to start app:', error);
  });
}