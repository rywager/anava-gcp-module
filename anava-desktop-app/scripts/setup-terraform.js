const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const os = require('os');
const crypto = require('crypto');
const { pipeline } = require('stream');
const { promisify } = require('util');
const streamPipeline = promisify(pipeline);

const TERRAFORM_VERSION = '1.5.7';
const TERRAFORM_BASE_URL = 'https://releases.hashicorp.com/terraform';

async function downloadFile(url, destination) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destination);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', reject);
      } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }
    }).on('error', reject);
  });
}

async function setupTerraform() {
  const platform = os.platform();
  const arch = os.arch();
  
  let tfPlatform;
  let tfArch;
  let tfExtension = '';
  
  // Map platform
  switch (platform) {
    case 'darwin':
      tfPlatform = 'darwin';
      break;
    case 'win32':
      tfPlatform = 'windows';
      tfExtension = '.exe';
      break;
    case 'linux':
      tfPlatform = 'linux';
      break;
    default:
      throw new Error(`Unsupported platform: ${platform}`);
  }
  
  // Map architecture
  switch (arch) {
    case 'x64':
      tfArch = 'amd64';
      break;
    case 'arm64':
      tfArch = 'arm64';
      break;
    default:
      throw new Error(`Unsupported architecture: ${arch}`);
  }
  
  const terraformBinDir = path.join(__dirname, '..', 'bin');
  const terraformBinPath = path.join(terraformBinDir, `terraform${tfExtension}`);
  
  // Create bin directory if it doesn't exist
  if (!fs.existsSync(terraformBinDir)) {
    fs.mkdirSync(terraformBinDir, { recursive: true });
  }
  
  // Check if terraform already exists
  if (fs.existsSync(terraformBinPath)) {
    try {
      const version = execSync(`"${terraformBinPath}" version`, { encoding: 'utf8' });
      if (version.includes(TERRAFORM_VERSION)) {
        console.log(`Terraform ${TERRAFORM_VERSION} already installed`);
        return;
      }
    } catch (e) {
      // Binary might be corrupted, re-download
    }
  }
  
  console.log(`Downloading Terraform ${TERRAFORM_VERSION} for ${tfPlatform}_${tfArch}...`);
  
  const zipFileName = `terraform_${TERRAFORM_VERSION}_${tfPlatform}_${tfArch}.zip`;
  const downloadUrl = `${TERRAFORM_BASE_URL}/${TERRAFORM_VERSION}/${zipFileName}`;
  const zipPath = path.join(terraformBinDir, zipFileName);
  
  // Download terraform
  await downloadFile(downloadUrl, zipPath);
  
  console.log('Extracting Terraform...');
  
  // Extract based on platform
  if (platform === 'win32') {
    // Use PowerShell on Windows
    execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${terraformBinDir}' -Force"`, {
      stdio: 'inherit'
    });
  } else {
    // Use unzip on Unix-like systems
    execSync(`unzip -o "${zipPath}" -d "${terraformBinDir}"`, {
      stdio: 'inherit'
    });
  }
  
  // Make executable on Unix-like systems
  if (platform !== 'win32') {
    fs.chmodSync(terraformBinPath, '755');
  }
  
  // Clean up zip file
  fs.unlinkSync(zipPath);
  
  // Verify installation
  const version = execSync(`"${terraformBinPath}" version`, { encoding: 'utf8' });
  console.log('Terraform installed successfully:', version.split('\n')[0]);
}

// Run setup
setupTerraform().catch(console.error);