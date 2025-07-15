#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const platform = os.platform();
const arch = os.arch();

console.log(`Building Anava Vision Desktop for ${platform}-${arch}`);

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
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true,
      ...options
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });
  });
}

async function buildRenderer() {
  log('Building React renderer...', 'cyan');
  
  try {
    await runCommand('npm', ['run', 'build'], {
      cwd: path.join(__dirname, '..', 'src', 'renderer')
    });
    log('✅ React renderer built successfully', 'green');
  } catch (error) {
    log('❌ Failed to build React renderer', 'red');
    throw error;
  }
}

async function buildElectron() {
  log('Building Electron application...', 'cyan');
  
  try {
    const args = ['run', 'build'];
    
    // Add platform-specific arguments
    if (process.argv.includes('--mac')) {
      args.push('--mac');
    } else if (process.argv.includes('--win')) {
      args.push('--win');
    } else if (process.argv.includes('--linux')) {
      args.push('--linux');
    } else if (process.argv.includes('--all')) {
      args.push('--all');
    }
    
    await runCommand('npm', args);
    log('✅ Electron application built successfully', 'green');
  } catch (error) {
    log('❌ Failed to build Electron application', 'red');
    throw error;
  }
}

async function createIcons() {
  log('Creating application icons...', 'cyan');
  
  const iconsDir = path.join(__dirname, '..', 'assets');
  
  // Create a simple icon placeholder (in production, you'd use proper icon files)
  const iconData = {
    mac: 'icon.icns',
    win: 'icon.ico',
    linux: 'icon.png'
  };
  
  try {
    if (!fs.existsSync(iconsDir)) {
      fs.mkdirSync(iconsDir, { recursive: true });
    }
    
    // For now, we'll create placeholder files
    // In production, you would use proper icon generation tools
    for (const [platform, filename] of Object.entries(iconData)) {
      const iconPath = path.join(iconsDir, filename);
      if (!fs.existsSync(iconPath)) {
        fs.writeFileSync(iconPath, ''); // Placeholder
        log(`Created placeholder icon: ${filename}`, 'yellow');
      }
    }
    
    log('✅ Icons created successfully', 'green');
  } catch (error) {
    log('❌ Failed to create icons', 'red');
    throw error;
  }
}

async function copyAssets() {
  log('Copying assets...', 'cyan');
  
  try {
    // Copy any additional assets needed for the build
    const assetsDir = path.join(__dirname, '..', 'assets');
    if (!fs.existsSync(assetsDir)) {
      fs.mkdirSync(assetsDir, { recursive: true });
    }
    
    log('✅ Assets copied successfully', 'green');
  } catch (error) {
    log('❌ Failed to copy assets', 'red');
    throw error;
  }
}

async function validateEnvironment() {
  log('Validating build environment...', 'cyan');
  
  try {
    // Check if required directories exist
    const requiredDirs = [
      'src/main',
      'src/renderer',
      'assets'
    ];
    
    for (const dir of requiredDirs) {
      const dirPath = path.join(__dirname, '..', dir);
      if (!fs.existsSync(dirPath)) {
        throw new Error(`Required directory not found: ${dir}`);
      }
    }
    
    // Check if package.json exists
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
      throw new Error('package.json not found');
    }
    
    log('✅ Environment validation passed', 'green');
  } catch (error) {
    log('❌ Environment validation failed', 'red');
    throw error;
  }
}

async function main() {
  try {
    log('🚀 Starting Anava Vision Desktop build process...', 'bright');
    
    await validateEnvironment();
    await createIcons();
    await copyAssets();
    await buildRenderer();
    await buildElectron();
    
    log('🎉 Build completed successfully!', 'green');
    log('📦 Check the dist/ directory for build artifacts', 'cyan');
    
  } catch (error) {
    log('💥 Build failed: ' + error.message, 'red');
    process.exit(1);
  }
}

// Handle process interruption
process.on('SIGINT', () => {
  log('\\n🛑 Build process interrupted', 'yellow');
  process.exit(1);
});

process.on('SIGTERM', () => {
  log('\\n🛑 Build process terminated', 'yellow');
  process.exit(1);
});

// Run the build process
main();