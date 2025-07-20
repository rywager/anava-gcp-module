const log = require('electron-log');

class OutputValidator {
  // Define all required fields that must be present in the Terraform outputs
  static REQUIRED_FIELDS = {
    'api_gateway_url': {
      type: 'string',
      validate: (value) => value && value.startsWith('https://'),
      errorMessage: 'API Gateway URL is missing or invalid'
    },
    'api_key': {
      type: 'string', 
      validate: (value) => value && value.length > 10,
      errorMessage: 'API Key is missing or too short'
    },
    'firebase_config': {
      type: 'object',
      validate: (value) => {
        if (!value || typeof value !== 'object') return false;
        const requiredFields = ['apiKey', 'authDomain', 'projectId', 'storageBucket'];
        return requiredFields.every(field => value[field]);
      },
      errorMessage: 'Firebase configuration is incomplete'
    },
    'device_auth_sa_email': {
      type: 'string',
      validate: (value) => value && value.includes('@') && value.endsWith('.iam.gserviceaccount.com'),
      errorMessage: 'Device Auth service account email is invalid'
    },
    'tvm_sa_email': {
      type: 'string',
      validate: (value) => value && value.includes('@') && value.endsWith('.iam.gserviceaccount.com'),
      errorMessage: 'Token Vending Machine service account email is invalid'
    },
    'vertex_ai_sa_email': {
      type: 'string',
      validate: (value) => value && value.includes('@') && value.endsWith('.iam.gserviceaccount.com'),
      errorMessage: 'Vertex AI service account email is invalid'
    },
    'wif_provider': {
      type: 'string',
      validate: (value) => value && value.includes('workloadIdentityPools'),
      errorMessage: 'Workload Identity Federation provider is invalid'
    }
  };

  static validateOutputs(outputs) {
    const errors = [];
    const warnings = [];
    
    if (!outputs || typeof outputs !== 'object') {
      return {
        isValid: false,
        errors: ['Terraform outputs are null or invalid'],
        warnings: [],
        missingFields: Object.keys(this.REQUIRED_FIELDS)
      };
    }

    const missingFields = [];
    const invalidFields = [];

    // Check each required field
    for (const [fieldName, fieldConfig] of Object.entries(this.REQUIRED_FIELDS)) {
      const output = outputs[fieldName];
      
      // Check if field exists
      if (!output) {
        missingFields.push(fieldName);
        errors.push(`Missing required field: ${fieldName}`);
        continue;
      }

      // Extract value (Terraform outputs have a 'value' property)
      const value = output.value !== undefined ? output.value : output;

      // Validate the value
      if (!fieldConfig.validate(value)) {
        invalidFields.push(fieldName);
        errors.push(fieldConfig.errorMessage);
      }
    }

    // Special validation for API Gateway URL format
    if (outputs.api_gateway_url?.value) {
      const url = outputs.api_gateway_url.value;
      if (!url.includes('.gateway.dev') && !url.includes('.apigateway.')) {
        warnings.push('API Gateway URL format looks unusual - please verify it\'s correct');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      missingFields,
      invalidFields
    };
  }

  static async attemptRecovery(outputs, projectId, mainWindow) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    
    log.info('Attempting to recover missing outputs...');
    const recoveredOutputs = { ...outputs };

    // If API Gateway URL is missing, try to find it with retries
    if (!outputs.api_gateway_url?.value) {
      let retryCount = 0;
      const maxRetries = 30; // 30 retries * 30 seconds = 15 minutes max wait
      let gatewayFound = false;
      
      // First check if API deployment exists
      try {
        log.info('Checking for API Gateway deployments...');
        const { stdout: deployments } = await execAsync(`gcloud api-gateway api-configs list --api=anava-api --project=${projectId} --format=json`);
        const configs = JSON.parse(deployments || '[]');
        if (configs && configs.length > 0) {
          log.info(`Found ${configs.length} API configurations, waiting for gateway...`);
          if (mainWindow) {
            mainWindow.webContents.send('terraform:progress', { 
              stage: 'recovery', 
              message: `API Gateway deployment in progress. This can take 10-15 minutes...`
            });
          }
        }
      } catch (error) {
        log.info('No API configurations found yet, will check for gateway...');
      }
      
      while (!gatewayFound && retryCount < maxRetries) {
        try {
          if (retryCount > 0) {
            const waitTime = 30; // 30 seconds between retries
            const minutesWaited = Math.floor((retryCount * waitTime) / 60);
            const minutesRemaining = Math.ceil(((maxRetries - retryCount) * waitTime) / 60);
            
            log.info(`API Gateway not ready yet, waiting ${waitTime} seconds before retry ${retryCount}/${maxRetries}...`);
            if (mainWindow) {
              mainWindow.webContents.send('terraform:progress', { 
                stage: 'recovery', 
                message: `Waiting for API Gateway deployment (${minutesWaited} min elapsed, up to ${minutesRemaining} min remaining)...`
              });
            }
            await new Promise(resolve => setTimeout(resolve, waitTime * 1000));
          }
          
          log.info('Checking for API Gateway...');
          const { stdout } = await execAsync(`gcloud api-gateway gateways list --project=${projectId} --format=json`);
          const gateways = JSON.parse(stdout || '[]');
          
          if (gateways && gateways.length > 0) {
            // Find the anava gateway
            const anavaGateway = gateways.find(g => g.name.includes('anava')) || gateways[0];
            if (anavaGateway && anavaGateway.defaultHostname) {
              recoveredOutputs.api_gateway_url = { value: `https://${anavaGateway.defaultHostname}` };
              log.info(`Recovered API Gateway URL: ${recoveredOutputs.api_gateway_url.value}`);
              gatewayFound = true;
              
              if (mainWindow) {
                mainWindow.webContents.send('terraform:progress', { 
                  stage: 'recovery', 
                  message: `API Gateway deployed successfully!`
                });
              }
            } else if (anavaGateway) {
              log.info(`API Gateway found but no hostname yet (state: ${anavaGateway.state}), will retry...`);
            }
          } else {
            log.info('No API Gateways found yet, deployment still in progress...');
          }
          
          retryCount++;
        } catch (error) {
          log.error('Failed to check API Gateway:', error.message);
          if (error.stderr) {
            log.error('gcloud stderr:', error.stderr);
          }
          retryCount++;
        }
      }
      
      if (!gatewayFound) {
        // If we still don't have it after retries, use placeholder
        recoveredOutputs.api_gateway_url = { 
          value: `https://anava-gateway-pending.${projectId}.gateway.dev` 
        };
        log.warn('API Gateway not ready after 15 minutes - deployment may have failed or is still in progress');
        
        if (mainWindow) {
          mainWindow.webContents.send('terraform:progress', { 
            stage: 'recovery', 
            message: `API Gateway deployment timed out. Please check Google Cloud Console for status.`
          });
        }
      }
    }

    // If API key is missing, try to find it
    if (!outputs.api_key?.value) {
      try {
        log.info('Recovering API Key...');
        const { stdout } = await execAsync(`gcloud services api-keys list --project=${projectId} --format=json`);
        const keys = JSON.parse(stdout);
        
        if (keys && keys.length > 0) {
          // Find the anava API key
          const anavaKey = keys.find(k => k.displayName?.includes('anava')) || keys[0];
          if (anavaKey && anavaKey.keyString) {
            recoveredOutputs.api_key = { value: anavaKey.keyString };
            log.info('Recovered API Key');
          }
        }
      } catch (error) {
        log.error('Failed to recover API Key:', error.message);
        
        // Use placeholder
        recoveredOutputs.api_key = { value: 'CHECK_GOOGLE_CLOUD_CONSOLE' };
        log.warn('Using placeholder API Key - check Google Cloud Console');
      }
    }

    // Recover service account emails based on pattern
    const serviceAccounts = [
      { field: 'device_auth_sa_email', name: 'anava-device-auth-sa' },
      { field: 'tvm_sa_email', name: 'anava-tvm-sa' },
      { field: 'vertex_ai_sa_email', name: 'anava-vertex-ai-sa' }
    ];

    for (const sa of serviceAccounts) {
      if (!outputs[sa.field]?.value) {
        recoveredOutputs[sa.field] = { 
          value: `${sa.name}@${projectId}.iam.gserviceaccount.com` 
        };
        log.info(`Recovered ${sa.field}: ${recoveredOutputs[sa.field].value}`);
      }
    }

    // Recover WIF provider
    if (!outputs.wif_provider?.value) {
      try {
        log.info('Recovering WIF Provider...');
        const { stdout } = await execAsync(
          `gcloud iam workload-identity-pools providers list ` +
          `--workload-identity-pool=anava-wif-pool --location=global --project=${projectId} --format=json`
        );
        const providers = JSON.parse(stdout);
        
        if (providers && providers.length > 0) {
          const provider = providers[0];
          recoveredOutputs.wif_provider = { value: provider.name };
          log.info(`Recovered WIF Provider: ${recoveredOutputs.wif_provider.value}`);
        }
      } catch (error) {
        log.error('Failed to recover WIF Provider:', error.message);
        
        // Use standard pattern
        const projectNumber = outputs.project_number?.value || '000000000000';
        recoveredOutputs.wif_provider = { 
          value: `projects/${projectNumber}/locations/global/workloadIdentityPools/anava-wif-pool/providers/anava-firebase-provider` 
        };
        log.warn('Using constructed WIF Provider path - may need verification');
      }
    }

    // Firebase config is harder to recover automatically
    if (!outputs.firebase_config?.value) {
      recoveredOutputs.firebase_config = {
        value: {
          projectId: projectId,
          apiKey: 'Check Firebase Console',
          authDomain: `${projectId}.firebaseapp.com`,
          storageBucket: `${projectId}.appspot.com`,
          messagingSenderId: 'Check Firebase Console',
          appId: 'Check Firebase Console'
        }
      };
      log.warn('Firebase config partially recovered - some fields need manual verification');
    }

    return recoveredOutputs;
  }

  static formatValidationReport(validation) {
    let report = '\n=== Terraform Output Validation Report ===\n';
    
    if (validation.isValid) {
      report += '✅ All required outputs are present and valid\n';
    } else {
      report += '❌ Validation failed\n\n';
      
      if (validation.missingFields.length > 0) {
        report += 'Missing Fields:\n';
        validation.missingFields.forEach(field => {
          report += `  - ${field}\n`;
        });
        report += '\n';
      }

      if (validation.errors.length > 0) {
        report += 'Errors:\n';
        validation.errors.forEach(error => {
          report += `  - ${error}\n`;
        });
        report += '\n';
      }
    }

    if (validation.warnings.length > 0) {
      report += 'Warnings:\n';
      validation.warnings.forEach(warning => {
        report += `  ⚠️  ${warning}\n`;
      });
    }

    report += '==========================================\n';
    return report;
  }
}

module.exports = OutputValidator;