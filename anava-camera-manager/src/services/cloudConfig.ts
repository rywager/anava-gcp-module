import axios from 'axios';
import { CloudConfig } from '../types';
import { loadTerraformOutputs } from './terraformIntegration';

// This will fetch configuration from the terraform-installer deployment
export async function fetchCloudConfig(): Promise<CloudConfig> {
  try {
    // First, try to get config from local terraform outputs
    const terraformConfig = await loadTerraformOutputs();
    
    if (terraformConfig) {
      console.log('Using terraform outputs for configuration');
      return terraformConfig;
    }
    
    // Fallback to fetching from deployment API
    const deploymentId = process.env.DEPLOYMENT_ID || localStorage.getItem('deploymentId');
    
    if (!deploymentId) {
      throw new Error('No deployment ID found. Please set DEPLOYMENT_ID or select a deployment.');
    }
    
    const response = await axios.get(
      `https://terraform-installer-api.run.app/api/deployment/${deploymentId}/acap-config`
    );
    
    return response.data;
    
  } catch (error) {
    console.error('Error fetching cloud config:', error);
    
    // Return a default config for development
    return getDefaultConfig();
  }
}

async function getTerraformOutputs(): Promise<any> {
  try {
    // Try to read from local file if available
    const fs = require('fs').promises;
    const path = require('path');
    
    const outputsPath = path.join(__dirname, '../../../outputs.json');
    const data = await fs.readFile(outputsPath, 'utf-8');
    
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function parseToCloudConfig(outputs: any): CloudConfig {
  return {
    projectId: outputs.project_id?.value || 'anava-vision',
    region: outputs.region?.value || 'us-central1',
    endpoints: {
      enrollment: outputs.camera_enrollment_url?.value || '',
      config: outputs.camera_config_url?.value || '',
      mcp: outputs.mcp_server_url?.value || '',
      chat: outputs.chat_interface_url?.value || ''
    },
    certificates: {
      ca: outputs.certificate_authority?.value || '',
      serverName: outputs.server_name?.value || ''
    },
    deployment: {
      acapVersion: outputs.acap_version?.value || 'latest',
      downloadUrl: outputs.acap_download_url?.value || ''
    }
  };
}

function getDefaultConfig(): CloudConfig {
  return {
    projectId: 'anava-vision-demo',
    region: 'us-central1',
    endpoints: {
      enrollment: 'https://camera-enrollment.run.app/api/enroll',
      config: 'https://camera-config.run.app/api/config',
      mcp: 'wss://anava-mcp-server.run.app',
      chat: 'https://anava-chat.web.app'
    },
    certificates: {
      ca: '',
      serverName: 'anava-vision.internal'
    },
    deployment: {
      acapVersion: '1.0.0',
      downloadUrl: 'https://storage.googleapis.com/anava-acap/BatonDescribe.eap'
    }
  };
}

export async function saveDeploymentId(deploymentId: string): Promise<void> {
  if (typeof window !== 'undefined') {
    localStorage.setItem('deploymentId', deploymentId);
  }
}

export async function getAvailableDeployments(): Promise<any[]> {
  try {
    const response = await axios.get('https://terraform-installer-api.run.app/api/deployments');
    return response.data;
  } catch (error) {
    console.error('Error fetching deployments:', error);
    return [];
  }
}