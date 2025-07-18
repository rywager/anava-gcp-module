const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { app } = require('electron');
const log = require('electron-log');

class TerraformService {
  constructor() {
    this.workDir = null;
    this.process = null;
    
    // Just use the system terraform or the one we downloaded
    const binName = process.platform === 'win32' ? 'terraform.exe' : 'terraform';
    const localBin = path.join(__dirname, '..', '..', '..', 'bin', binName);
    
    if (require('fs').existsSync(localBin)) {
      this.terraformPath = localBin;
    } else {
      this.terraformPath = 'terraform'; // Use system terraform
    }
  }

  async initialize(projectId) {
    // Create a temporary directory for Terraform files
    this.workDir = path.join(os.tmpdir(), `anava-terraform-${Date.now()}`);
    await fs.mkdir(this.workDir, { recursive: true });
    
    log.info(`Terraform working directory: ${this.workDir}`);
    
    // Copy the fixed Terraform module
    await this.copyTerraformModule();
    
    // Create terraform.tfvars
    await this.createTfVars(projectId);
    
    // Log terraform version for debugging
    try {
      const version = await this.runCommand(this.terraformPath, ['version'], null);
      log.info(`Terraform version: ${version}`);
    } catch (error) {
      log.warn(`Could not get terraform version: ${error.message}`);
    }
    
    return this.workDir;
  }

  async copyTerraformModule() {
    const moduleSource = path.join(__dirname, '..', '..', '..', 'terraform-module');
    
    // Check if module exists
    try {
      await fs.access(moduleSource);
    } catch (error) {
      throw new Error(`Terraform module not found at ${moduleSource}`);
    }
    
    const files = [
      'main.tf',
      'variables.tf',
      'outputs.tf',
      'versions.tf',
      'api-gateway-config.yaml' // Add API Gateway config
    ];
    
    // Copy main files
    for (const file of files) {
      try {
        const content = await fs.readFile(path.join(moduleSource, file), 'utf8');
        await fs.writeFile(path.join(this.workDir, file), content);
      } catch (error) {
        console.warn(`Optional file ${file} not found, skipping`);
      }
    }
    
    // Copy subdirectories
    const subdirs = ['templates', 'rules', 'functions'];
    for (const dir of subdirs) {
      const srcDir = path.join(moduleSource, dir);
      const destDir = path.join(this.workDir, dir);
      
      try {
        await fs.access(srcDir);
        await this.copyDirectory(srcDir, destDir);
      } catch (error) {
        console.warn(`Optional directory ${dir} not found, skipping`);
      }
    }
  }

  async copyDirectory(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });
    
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      
      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        const content = await fs.readFile(srcPath);
        await fs.writeFile(destPath, content);
      }
    }
  }

  async createTfVars(projectId) {
    const tfvars = `project_id = "${projectId}"
region     = "us-central1"
solution_prefix = "anava"
storage_location = "US"`;
    
    await fs.writeFile(path.join(this.workDir, 'terraform.tfvars'), tfvars);
  }

  async runCommand(command, args, onProgress) {
    return new Promise((resolve, reject) => {
      if (!this.workDir) {
        reject(new Error('Terraform not initialized. Call initialize() first.'));
        return;
      }

      this.process = spawn(command, args, {
        cwd: this.workDir,
        env: {
          ...process.env,
          TF_IN_AUTOMATION: 'true',
          TF_LOG: process.env.NODE_ENV === 'development' ? 'DEBUG' : 'INFO',
          TF_LOG_PATH: path.join(this.workDir, 'terraform.log'),
          GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || ''
        }
      });

      let output = '';
      let errorOutput = '';

      this.process.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        
        // Log all terraform output in dev mode
        if (process.env.NODE_ENV === 'development') {
          log.info(`[Terraform stdout]: ${text.trim()}`);
        }
        
        // Parse Terraform progress messages
        if (text.includes('Creating...') || text.includes('Modifying...')) {
          const match = text.match(/(\w+)\.(\w+):\s*(Creating|Modifying|Destroying)\.\.\.$/);
          if (match && onProgress) {
            onProgress({ 
              type: 'progress', 
              resource: match[2],
              action: match[3],
              data: text 
            });
          }
        } else if (onProgress) {
          onProgress({ type: 'stdout', data: text });
        }
      });

      this.process.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        
        // Log all terraform errors
        log.error(`[Terraform stderr]: ${text.trim()}`);
        
        // Filter out non-error messages from stderr
        if (!text.includes('[INFO]') && !text.includes('[DEBUG]') && onProgress) {
          onProgress({ type: 'stderr', data: text });
        }
      });

      this.process.on('close', (code) => {
        this.process = null;
        
        if (code === 0) {
          resolve(output);
        } else {
          // Extract meaningful error message
          const errorLines = errorOutput.split('\n').filter(line => 
            line.includes('Error:') || 
            line.includes('error:') || 
            line.includes('failed')
          );
          const errorMessage = errorLines.length > 0 
            ? errorLines.join('\n') 
            : `Command failed with code ${code}`;
          
          reject(new Error(errorMessage));
        }
      });

      this.process.on('error', (error) => {
        this.process = null;
        reject(error);
      });
    });
  }

  async init(onProgress) {
    return this.runCommand(this.terraformPath, ['init', '-upgrade', '-reconfigure'], onProgress);
  }

  async plan(onProgress) {
    try {
      // First try a targeted plan that ignores existing resources
      return await this.runCommand(this.terraformPath, ['plan', '-out=tfplan', '-refresh=false'], onProgress);
    } catch (error) {
      if (onProgress) {
        onProgress({ type: 'stderr', data: `Plan failed. Checking if resources already exist...` });
      }
      
      // If the error contains "already exists", we know the infrastructure is there
      if (error.message && error.message.includes('already exists')) {
        if (onProgress) {
          onProgress({ type: 'stdout', data: 'Infrastructure already exists. Skipping to output retrieval...' });
        }
        // Return a special marker to indicate we should skip to outputs
        return 'SKIP_TO_OUTPUTS';
      }
      
      throw error;
    }
  }

  async apply(onProgress) {
    try {
      return await this.runCommand(this.terraformPath, ['apply', '-auto-approve', 'tfplan'], onProgress);
    } catch (error) {
      if (onProgress) {
        onProgress({ type: 'stderr', data: `Apply failed: ${error.message}. Attempting recovery...` });
      }
      
      // Try to recover by running apply again (handles partial failures)
      try {
        if (onProgress) {
          onProgress({ type: 'stdout', data: 'Retrying apply to handle partial failures...' });
        }
        return await this.runCommand(this.terraformPath, ['apply', '-auto-approve', 'tfplan'], onProgress);
      } catch (retryError) {
        if (onProgress) {
          onProgress({ type: 'stderr', data: `Retry failed: ${retryError.message}. Running refresh and plan...` });
        }
        
        // Refresh state and try once more
        await this.runCommand(this.terraformPath, ['refresh'], onProgress);
        await this.runCommand(this.terraformPath, ['plan', '-out=tfplan'], onProgress);
        return await this.runCommand(this.terraformPath, ['apply', '-auto-approve', 'tfplan'], onProgress);
      }
    }
  }

  async getOutputs() {
    const output = await this.runCommand(this.terraformPath, ['output', '-json']);
    return JSON.parse(output);
  }

  async destroy(onProgress) {
    return this.runCommand(this.terraformPath, ['destroy', '-auto-approve'], onProgress);
  }

  async cleanup() {
    if (this.workDir) {
      await fs.rm(this.workDir, { recursive: true, force: true });
    }
  }

  stop() {
    if (this.process) {
      this.process.kill();
    }
  }
}

module.exports = TerraformService;