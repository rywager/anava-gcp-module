const { spawn } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { app } = require('electron');

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
    
    // Copy the fixed Terraform module
    await this.copyTerraformModule();
    
    // Create terraform.tfvars
    await this.createTfVars(projectId);
    
    return this.workDir;
  }

  async copyTerraformModule() {
    const moduleSource = path.join(__dirname, '..', '..', '..', 'terraform-module');
    const files = [
      'main.tf',
      'variables.tf',
      'outputs.tf',
      'versions.tf'
    ];
    
    // Copy main files
    for (const file of files) {
      const content = await fs.readFile(path.join(moduleSource, file), 'utf8');
      await fs.writeFile(path.join(this.workDir, file), content);
    }
    
    // Copy subdirectories
    const subdirs = ['templates', 'rules', 'functions'];
    for (const dir of subdirs) {
      const srcDir = path.join(moduleSource, dir);
      const destDir = path.join(this.workDir, dir);
      await this.copyDirectory(srcDir, destDir);
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
      this.process = spawn(command, args, {
        cwd: this.workDir,
        env: {
          ...process.env,
          TF_IN_AUTOMATION: 'true',
          TF_LOG: 'INFO'
        }
      });

      let output = '';
      let errorOutput = '';

      this.process.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        if (onProgress) {
          onProgress({ type: 'stdout', data: text });
        }
      });

      this.process.stderr.on('data', (data) => {
        const text = data.toString();
        errorOutput += text;
        if (onProgress) {
          onProgress({ type: 'stderr', data: text });
        }
      });

      this.process.on('close', (code) => {
        if (code === 0) {
          resolve(output);
        } else {
          reject(new Error(`Command failed with code ${code}: ${errorOutput}`));
        }
      });

      this.process.on('error', (error) => {
        reject(error);
      });
    });
  }

  async init(onProgress) {
    return this.runCommand(this.terraformPath, ['init', '-upgrade'], onProgress);
  }

  async plan(onProgress) {
    try {
      return await this.runCommand(this.terraformPath, ['plan', '-out=tfplan'], onProgress);
    } catch (error) {
      if (onProgress) {
        onProgress({ type: 'stderr', data: `Plan failed: ${error.message}. Attempting to handle import conflicts...` });
      }
      
      // Handle potential import conflicts by running a refresh first
      try {
        if (onProgress) {
          onProgress({ type: 'stdout', data: 'Running refresh to sync state...' });
        }
        await this.runCommand(this.terraformPath, ['refresh'], onProgress);
        return await this.runCommand(this.terraformPath, ['plan', '-out=tfplan'], onProgress);
      } catch (retryError) {
        throw retryError;
      }
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