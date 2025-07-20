#!/usr/bin/env python3
"""
Fix the logging and dashboard to show actual useful information
"""

import re

# Current STATUS messages we're sending vs what dashboard expects
CURRENT_STATUSES = """
From main.py:
- STATUS: DEPLOYMENT_STARTED
- STATUS: ENABLING_APIS  
- STATUS: CREATING_SERVICE_ACCOUNTS
- STATUS: PREPARING_TERRAFORM
- STATUS: RUNNING_TERRAFORM
- STATUS: DEPLOYMENT_COMPLETED
- STATUS: DEPLOYMENT_FAILED

From dashboard.html parseLogsForChecklist:
- DEPLOYMENT_STARTED → enabling-apis (active)
- ENABLING_APIS → enabling-apis (active)
- SETTING_PERMISSIONS → permissions (active)
- PREPARING_TERRAFORM → terraform-init (active)
- TERRAFORM_INIT → terraform-init (active)
- TERRAFORM_PLAN → terraform-plan (active)
- TERRAFORM_APPLY → terraform-apply (active)
- CREATING_FUNCTIONS → cloud-functions (active)
- CONFIGURING_FIREBASE → firebase (active)
- SETTING_UP_API_GATEWAY → api-gateway (active)
- FINALIZING_DEPLOYMENT → finalize (active)
- DEPLOYMENT_COMPLETED → outputs (completed)
"""

# The fix - update main.py to send the right STATUS messages
FIX_MAIN_PY = """
# Replace the deployment process with better status updates

def run_single_deployment(job_data):
    '''Process deployment with USEFUL status updates'''
    deployment_id = job_data['deploymentId']
    
    # ... existing setup code ...
    
    def log(message, step_info=None, is_error=False):
        '''Enhanced logging with context'''
        timestamp = datetime.utcnow().strftime('%H:%M:%S')
        log_entry = {
            'timestamp': timestamp,
            'message': message,
            'is_error': is_error,
            'deployment_id': deployment_id
        }
        
        # Store structured logs
        if REDIS_AVAILABLE and redis_client:
            try:
                # Store as JSON for better parsing
                redis_client.lpush(f'deployment_logs:{deployment_id}', json.dumps(log_entry))
                redis_client.expire(f'deployment_logs:{deployment_id}', 86400)
                
                if step_info:
                    redis_client.hset(f'deployment_steps:{deployment_id}', step_info['id'], json.dumps(step_info))
                    redis_client.expire(f'deployment_steps:{deployment_id}', 86400)
            except:
                pass
        
        # Also print for debugging
        print(f"[{deployment_id}] {message}")
    
    try:
        log("STATUS: DEPLOYMENT_STARTED")
        log(f"Deploying to project: {job_data['projectId']}")
        
        # Step 1: Enable APIs with detailed progress
        log("STATUS: ENABLING_APIS")
        required_apis = [
            'cloudbuild.googleapis.com',
            'cloudfunctions.googleapis.com', 
            'firebase.googleapis.com',
            'firestore.googleapis.com',
            'apigateway.googleapis.com',
            'storage.googleapis.com',
            'firebasestorage.googleapis.com'
        ]
        
        for i, api in enumerate(required_apis, 1):
            log(f"Enabling API {i}/{len(required_apis)}: {api}")
            # Actually enable the API
            enable_api(project_id, api, credentials)
            log(f"✓ Enabled: {api}")
        
        log("STATUS: SETTING_PERMISSIONS")
        log("Granting permissions to service agents...")
        
        # Grant permissions to Google service agents
        project_number = get_project_number(project_id, credentials)
        
        # Cloud Functions service agent
        log("Granting storage.admin to Cloud Functions service agent...")
        grant_role(f"service-{project_number}@gcf-admin-robot.iam.gserviceaccount.com", 
                  "roles/storage.admin", project_id, credentials)
        
        # API Gateway service agent  
        log("Granting apigateway.serviceAgent to API Gateway service agent...")
        grant_role(f"service-{project_number}@gcp-sa-apigateway-mgmt.iam.gserviceaccount.com",
                  "roles/apigateway.serviceAgent", project_id, credentials)
        
        log("STATUS: PREPARING_TERRAFORM")
        log("Setting up Terraform configuration...")
        
        # ... terraform setup ...
        
        log("STATUS: TERRAFORM_INIT")
        log("Initializing Terraform providers...")
        # Run terraform init with output
        
        log("STATUS: TERRAFORM_PLAN") 
        log("Planning infrastructure changes...")
        # Run terraform plan
        
        log("STATUS: TERRAFORM_APPLY")
        log("Creating infrastructure resources...")
        
        # Parse terraform output to show progress
        # For each resource created:
        log("Creating: google_storage_bucket.firebase_bucket")
        log("✓ Created: google_storage_bucket.firebase_bucket")
        
        log("STATUS: CREATING_FUNCTIONS")
        log("Deploying Cloud Functions...")
        
        log("STATUS: CONFIGURING_FIREBASE")
        log("Setting up Firebase services...")
        
        log("STATUS: SETTING_UP_API_GATEWAY")
        log("Configuring API Gateway...")
        
        log("STATUS: FINALIZING_DEPLOYMENT")
        log("Retrieving deployment outputs...")
        
        log("STATUS: DEPLOYMENT_COMPLETED")
        log("✅ Deployment successful!")
        
    except Exception as e:
        log(f"STATUS: DEPLOYMENT_FAILED", is_error=True)
        log(f"Error: {str(e)}", is_error=True)
"""

# Fix for dashboard.html
FIX_DASHBOARD = """
// Enhanced log parsing with better status tracking
function parseLogsForChecklist(logs) {
    logs.forEach(log => {
        let logData;
        try {
            // Try parsing as JSON first (new format)
            logData = JSON.parse(log);
        } catch {
            // Fall back to string parsing (old format)
            logData = {
                message: log.split(' - ')[1] || log,
                timestamp: log.split(' - ')[0] || new Date().toISOString()
            };
        }
        
        const message = logData.message;
        
        // Update detailed logs with better formatting
        if (logData.is_error) {
            appendToLogs(`<span style="color: var(--error)">${message}</span>`);
        } else if (message.startsWith('✓')) {
            appendToLogs(`<span style="color: var(--success)">${message}</span>`);
        } else if (message.includes('STATUS:')) {
            appendToLogs(`<strong>${message}</strong>`);
        } else {
            appendToLogs(message);
        }
        
        // Parse STATUS messages for checklist
        if (message.includes('STATUS:')) {
            const status = message.split('STATUS:')[1].trim();
            handleStatusUpdate(status);
        }
        
        // Parse progress messages
        if (message.includes('Enabling API') || message.includes('Creating:')) {
            updateCurrentStepProgress(message);
        }
    });
}

function handleStatusUpdate(status) {
    // Map status to checklist steps with better transitions
    const statusMap = {
        'DEPLOYMENT_STARTED': () => {
            updateStepStatus('enabling-apis', 'active');
        },
        'ENABLING_APIS': () => {
            updateStepStatus('enabling-apis', 'active');
        },
        'SETTING_PERMISSIONS': () => {
            updateStepStatus('enabling-apis', 'completed', {'Result': '✓ All APIs enabled'});
            updateStepStatus('permissions', 'active');
        },
        'PREPARING_TERRAFORM': () => {
            updateStepStatus('permissions', 'completed', {'Result': '✓ Permissions configured'});
            updateStepStatus('terraform-init', 'active');
        },
        'TERRAFORM_INIT': () => {
            updateStepStatus('terraform-init', 'active');
        },
        'TERRAFORM_PLAN': () => {
            updateStepStatus('terraform-init', 'completed', {'Result': '✓ Terraform initialized'});
            updateStepStatus('terraform-plan', 'active');
        },
        'TERRAFORM_APPLY': () => {
            updateStepStatus('terraform-plan', 'completed', {'Result': '✓ Plan generated'});
            updateStepStatus('terraform-apply', 'active');
        },
        'CREATING_FUNCTIONS': () => {
            updateStepStatus('terraform-apply', 'completed', {'Result': '✓ Resources created'});
            updateStepStatus('cloud-functions', 'active');
        },
        'CONFIGURING_FIREBASE': () => {
            updateStepStatus('cloud-functions', 'completed', {'Result': '✓ Functions deployed'});
            updateStepStatus('firebase', 'active');
        },
        'SETTING_UP_API_GATEWAY': () => {
            updateStepStatus('firebase', 'completed', {'Result': '✓ Firebase configured'});
            updateStepStatus('api-gateway', 'active');
        },
        'FINALIZING_DEPLOYMENT': () => {
            updateStepStatus('api-gateway', 'completed', {'Result': '✓ API Gateway ready'});
            updateStepStatus('finalize', 'active');
        },
        'DEPLOYMENT_COMPLETED': () => {
            updateStepStatus('finalize', 'completed', {'Result': '✓ Deployment finalized'});
            updateStepStatus('outputs', 'active');
        },
        'DEPLOYMENT_FAILED': () => {
            // Mark current active step as failed
            const activeStep = deploymentSteps.find(s => s.status === 'active');
            if (activeStep) {
                updateStepStatus(activeStep.id, 'failed');
            }
        }
    };
    
    if (statusMap[status]) {
        statusMap[status]();
    }
}

function updateCurrentStepProgress(message) {
    // Find the currently active step
    const activeStep = deploymentSteps.find(s => s.status === 'active');
    if (activeStep) {
        // Add progress message to the step
        const stepElement = document.querySelector(`[data-step-id="${activeStep.id}"]`);
        if (stepElement) {
            let progressElement = stepElement.querySelector('.step-progress');
            if (!progressElement) {
                progressElement = document.createElement('div');
                progressElement.className = 'step-progress';
                progressElement.style.cssText = 'font-size: 0.875rem; color: var(--text-secondary); margin-top: 0.5rem;';
                stepElement.appendChild(progressElement);
            }
            progressElement.textContent = message;
        }
    }
}
"""

print("📝 Logging and Dashboard Fix Plan")
print("=" * 60)
print("\n1. MAIN ISSUES:")
print("   - Logs are not structured (just strings)")
print("   - STATUS messages don't match what dashboard expects")
print("   - No real-time progress within steps")
print("   - Dashboard shows everything as 'pending' because statuses don't match")
print("\n2. THE FIX:")
print("   - Send the RIGHT status messages that dashboard expects")
print("   - Add progress messages within each step")
print("   - Structure logs as JSON for better parsing")
print("   - Show actual useful information (API names, resource names, etc.)")
print("\n3. IMPLEMENTATION:")
print("   - Update main.py deployment function")
print("   - Fix dashboard.html log parsing")
print("   - Add real-time progress updates")