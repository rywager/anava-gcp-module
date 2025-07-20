import * as fs from 'fs/promises';
import * as path from 'path';
import { CloudConfig } from '../types';

export async function loadTerraformOutputs(): Promise<CloudConfig | null> {
  try {
    // Try different possible locations for terraform outputs
    const possiblePaths = [
      path.join(__dirname, '../../../outputs.json'),           // From anava-camera-manager
      path.join(__dirname, '../../../../outputs.json'),        // From terraform-installer root
      path.join(__dirname, '../../../terraform.tfstate'),      // Direct state file
      '/tmp/terraform-outputs.json',                          // Temp location
      process.env.TERRAFORM_OUTPUTS_PATH                      // Environment variable
    ].filter(Boolean);

    for (const outputPath of possiblePaths) {
      try {
        console.log(`Checking for terraform outputs at: ${outputPath}`);
        const data = await fs.readFile(outputPath!, 'utf-8');
        
        if (outputPath!.endsWith('.tfstate')) {
          // Parse terraform state file
          const state = JSON.parse(data);
          return parseStateToConfig(state);
        } else {
          // Parse outputs JSON
          const outputs = JSON.parse(data);
          return parseOutputsToConfig(outputs);
        }
      } catch (err) {
        // Continue to next path
        continue;
      }
    }

    console.log('No terraform outputs found in any expected location');
    return null;
    
  } catch (error) {
    console.error('Error loading terraform outputs:', error);
    return null;
  }
}

function parseOutputsToConfig(outputs: any): CloudConfig {
  // Handle both direct outputs and nested output values
  const getValue = (key: string) => {
    return outputs[key]?.value || outputs[key] || '';
  };

  return {
    projectId: getValue('project_id') || getValue('gcp_project_id') || 'anava-vision',
    region: getValue('region') || getValue('gcp_region') || 'us-central1',
    endpoints: {
      enrollment: getValue('camera_enrollment_url') || getValue('enrollment_endpoint') || '',
      config: getValue('camera_config_url') || getValue('config_endpoint') || '',
      mcp: getValue('mcp_server_url') || getValue('mcp_endpoint') || '',
      chat: getValue('chat_interface_url') || getValue('chat_endpoint') || ''
    },
    certificates: {
      ca: getValue('certificate_authority') || getValue('ca_cert') || '',
      serverName: getValue('server_name') || getValue('cert_server_name') || 'anava-vision.internal'
    },
    deployment: {
      acapVersion: getValue('acap_version') || getValue('app_version') || 'latest',
      downloadUrl: getValue('acap_download_url') || getValue('acap_url') || ''
    }
  };
}

function parseStateToConfig(state: any): CloudConfig {
  // Extract outputs from terraform state
  const outputs = state.outputs || {};
  return parseOutputsToConfig(outputs);
}

export async function saveTerraformOutputs(config: CloudConfig): Promise<void> {
  try {
    const outputPath = path.join(__dirname, '../../../outputs.json');
    
    // Convert CloudConfig back to terraform outputs format
    const outputs = {
      project_id: { value: config.projectId },
      region: { value: config.region },
      camera_enrollment_url: { value: config.endpoints.enrollment },
      camera_config_url: { value: config.endpoints.config },
      mcp_server_url: { value: config.endpoints.mcp },
      chat_interface_url: { value: config.endpoints.chat },
      certificate_authority: { value: config.certificates.ca },
      server_name: { value: config.certificates.serverName },
      acap_version: { value: config.deployment.acapVersion },
      acap_download_url: { value: config.deployment.downloadUrl }
    };

    await fs.writeFile(outputPath, JSON.stringify(outputs, null, 2));
    console.log(`Saved terraform outputs to ${outputPath}`);
  } catch (error) {
    console.error('Error saving terraform outputs:', error);
    throw error;
  }
}

export async function watchTerraformOutputs(callback: (config: CloudConfig) => void): Promise<void> {
  const outputPath = path.join(__dirname, '../../../outputs.json');
  
  try {
    // Check if file exists and watch for changes
    await fs.access(outputPath);
    
    // Use fs.watch to monitor file changes
    const { watch } = await import('fs');
    
    watch(outputPath, (eventType) => {
      if (eventType === 'change') {
        console.log('Terraform outputs changed, reloading...');
        loadTerraformOutputs().then(config => {
          if (config) {
            callback(config);
          }
        });
      }
    });
    
    console.log(`Watching terraform outputs at ${outputPath}`);
  } catch (error) {
    console.log('Terraform outputs file not found, will use cloud config instead');
  }
}