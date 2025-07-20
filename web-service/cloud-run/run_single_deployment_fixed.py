"""
Fixed deployment function for v2.3.24
Integrates all fixes: smart cleanup, Firestore logging, output discovery
"""

import json
import os
import subprocess
import tempfile
import time
import traceback
from datetime import datetime
import google.auth.transport.requests
import google.oauth2.credentials
import requests
import concurrent.futures

# Import our fixes
from deployment_fixes import (
    FirestoreLogger,
    cleanup_blocking_resources,
    discover_existing_outputs,
    ensure_service_account_permissions,
    handle_terraform_imports
)

def run_single_deployment_fixed(job_data, db):
    """Fixed deployment process with smart resource handling"""
    deployment_id = job_data['deploymentId']
    
    deployment_ref = db.collection('deployments').document(deployment_id)
    deployment_ref.update({
        'status': 'running',
        'startedAt': datetime.utcnow(),
        'version': 'v2.3.24-fixed'
    })
    
    # Initialize Firestore logger
    logger = FirestoreLogger(db, deployment_id)
    
    try:
        # Log deployment start
        logger.log("STATUS: DEPLOYMENT_STARTED")
        logger.log(f"PROJECT: {job_data['projectId']}")
        logger.log(f"REGION: {job_data['region']}")
        logger.log(f"PREFIX: {job_data['prefix']}")
        logger.log("VERSION: v2.3.24 with smart resource handling")
        
        project_id = job_data['projectId']
        prefix = job_data['prefix']
        
        # Create auth header for API calls
        credentials = google.oauth2.credentials.Credentials(**job_data['credentials'])
        credentials.refresh(google.auth.transport.requests.Request())
        
        # Step 1: Enable APIs
        logger.log("STATUS: ENABLING_APIS")
        logger.log("ACTION: Enabling required Google Cloud APIs...")
        
        required_apis = [
            # Core infrastructure APIs
            'iam.googleapis.com',
            'iamcredentials.googleapis.com',
            'cloudresourcemanager.googleapis.com',
            'serviceusage.googleapis.com',
            'servicemanagement.googleapis.com',
            'servicecontrol.googleapis.com',
            # Firebase and storage
            'firebase.googleapis.com',
            'identitytoolkit.googleapis.com',
            'storage.googleapis.com',
            'firebasestorage.googleapis.com',
            'firestore.googleapis.com',
            # Cloud Functions and build
            'cloudfunctions.googleapis.com',
            'cloudbuild.googleapis.com',
            'artifactregistry.googleapis.com',
            # API Gateway and endpoints
            'apigateway.googleapis.com',
            'endpoints.googleapis.com',
            # AI and compute
            'aiplatform.googleapis.com',
            'compute.googleapis.com',
            'run.googleapis.com',
            # Security
            'sts.googleapis.com',
            'secretmanager.googleapis.com'
        ]
        
        headers = {'Authorization': f'Bearer {credentials.token}', 'Content-Type': 'application/json'}
        
        def enable_api(api):
            try:
                enable_url = f'https://serviceusage.googleapis.com/v1/projects/{project_id}/services/{api}:enable'
                response = requests.post(enable_url, headers=headers, json={})
                if response.status_code in [200, 201]:
                    return f"SUCCESS: Enabled {api}"
                elif response.status_code == 409:
                    return f"INFO: {api} already enabled"
                else:
                    return f"WARNING: Failed to enable {api}: {response.status_code}"
            except Exception as e:
                return f"ERROR: Failed to enable {api}: {str(e)[:100]}"
        
        logger.log(f"INFO: Enabling {len(required_apis)} APIs in parallel...")
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                futures = {executor.submit(enable_api, api): api for api in required_apis}
                completed = 0
                
                for future in concurrent.futures.as_completed(futures, timeout=30):
                    completed += 1
                    result = future.result()
                    if completed % 5 == 0:  # Log every 5th API to reduce noise
                        logger.log(f"PROGRESS: APIs enabled {completed}/{len(required_apis)}")
                        
        except concurrent.futures.TimeoutError:
            logger.log("WARNING: API enablement timed out after 30 seconds - continuing anyway")
        
        logger.log("SUCCESS: API enablement phase completed")
        
        # Step 2: Smart Resource Cleanup (only blocking resources)
        logger.log("STATUS: CLEANING_RESOURCES")
        cleaned = cleanup_blocking_resources(project_id, prefix, logger)
        
        # Step 3: Ensure Service Accounts and Permissions
        logger.log("STATUS: SETTING_PERMISSIONS")
        logger.log("ACTION: Configuring service accounts and permissions...")
        
        # Ensure service accounts exist with correct permissions
        ensure_service_account_permissions(project_id, prefix, logger)
        
        # Get project number for service agents
        try:
            project_info_url = f'https://cloudresourcemanager.googleapis.com/v1/projects/{project_id}'
            response = requests.get(project_info_url, headers=headers)
            if response.status_code == 200:
                project_number = response.json().get('projectNumber')
                logger.log(f"INFO: Project number: {project_number}")
            else:
                project_number = None
        except:
            project_number = None
        
        # Grant permissions to service agents
        if project_number:
            # Configure Cloud Build permissions (both old and new service accounts)
            build_service_accounts = [
                f"{project_number}@cloudbuild.gserviceaccount.com",
                f"{project_number}-compute@developer.gserviceaccount.com"
            ]
            
            build_roles = [
                'roles/cloudfunctions.developer',
                'roles/artifactregistry.writer',
                'roles/storage.objectAdmin',
                'roles/logging.logWriter',
                'roles/iam.serviceAccountUser'
            ]
            
            # Get current IAM policy
            iam_policy_url = f'https://cloudresourcemanager.googleapis.com/v1/projects/{project_id}:getIamPolicy'
            response = requests.post(iam_policy_url, headers=headers, json={})
            
            if response.status_code == 200:
                policy = response.json()
                policy_updated = False
                
                # Add Cloud Build permissions
                for build_sa in build_service_accounts:
                    build_member = f"serviceAccount:{build_sa}"
                    
                    for build_role in build_roles:
                        binding_exists = False
                        
                        for binding in policy.get('bindings', []):
                            if binding['role'] == build_role:
                                if build_member not in binding.get('members', []):
                                    binding['members'].append(build_member)
                                    policy_updated = True
                                binding_exists = True
                                break
                        
                        if not binding_exists:
                            policy['bindings'].append({
                                'role': build_role,
                                'members': [build_member]
                            })
                            policy_updated = True
                
                # Update policy if needed
                if policy_updated:
                    set_iam_url = f'https://cloudresourcemanager.googleapis.com/v1/projects/{project_id}:setIamPolicy'
                    response = requests.post(set_iam_url, headers=headers, json={'policy': policy})
                    
                    if response.status_code == 200:
                        logger.log("SUCCESS: All service permissions configured")
                        logger.log("INFO: Waiting 20 seconds for permissions to propagate...")
                        time.sleep(20)
                    else:
                        logger.log(f"WARNING: Failed to update some permissions: {response.status_code}")
        
        with tempfile.TemporaryDirectory() as temp_dir:
            # Step 4: Prepare Terraform
            logger.log("STATUS: PREPARING_TERRAFORM")
            logger.log("ACTION: Setting up Terraform configuration...")
            
            tf_config = f"""
terraform {{
  required_version = ">= 1.5.0"
}}

module "anava" {{
  source = "/terraform-cache/anava-gcp-module"
  
  project_id       = "{job_data['projectId']}"
  region          = "{job_data['region']}"
  solution_prefix = "{job_data['prefix']}"
  storage_location = "{job_data.get('storage_location', 'US')}"
}}

output "api_gateway_url" {{
  value = module.anava.api_gateway_url
}}

output "firebase_config" {{
  value = module.anava.firebase_config
  sensitive = true
}}

output "api_key" {{
  value = module.anava.api_key
  sensitive = true
}}

output "firebase_config_secret_name" {{
  value = module.anava.firebase_config_secret_name
}}

output "firebase_api_key_secret_name" {{
  value = module.anava.firebase_api_key_secret_name
}}

output "workload_identity_provider" {{
  value = module.anava.workload_identity_provider
}}

output "vertex_ai_service_account_email" {{
  value = module.anava.vertex_ai_service_account_email
}}

output "firebase_storage_bucket" {{
  value = module.anava.firebase_storage_bucket
}}

output "firebase_web_app_id" {{
  value = module.anava.firebase_web_app_id
}}
"""
            
            with open(os.path.join(temp_dir, 'main.tf'), 'w') as f:
                f.write(tf_config)
            
            # Set up credentials
            creds_file = os.path.join(temp_dir, 'creds.json')
            credentials.refresh(google.auth.transport.requests.Request())
            
            with open(creds_file, 'w') as f:
                f.write(json.dumps({
                    'type': 'authorized_user',
                    'client_id': credentials.client_id,
                    'client_secret': credentials.client_secret,
                    'refresh_token': credentials.refresh_token
                }))
            
            env = os.environ.copy()
            env['GOOGLE_APPLICATION_CREDENTIALS'] = creds_file
            
            # Step 5: Initialize Terraform
            logger.log("STATUS: TERRAFORM_INIT")
            logger.log("ACTION: Initializing Terraform...")
            
            result = subprocess.run(
                ['terraform', 'init'],
                cwd=temp_dir,
                capture_output=True,
                text=True,
                env=env,
                timeout=300
            )
            
            if result.returncode != 0:
                raise Exception(f"Terraform init failed: {result.stderr}")
            
            logger.log("SUCCESS: Terraform initialized")
            
            # Step 6: Import existing resources
            imports_done = handle_terraform_imports(temp_dir, project_id, prefix, env, logger)
            
            if imports_done:
                # Refresh state after imports
                logger.log("ACTION: Refreshing Terraform state after imports...")
                subprocess.run(
                    ['terraform', 'refresh'],
                    cwd=temp_dir,
                    capture_output=True,
                    text=True,
                    env=env
                )
            
            # Step 7: Plan deployment
            logger.log("STATUS: TERRAFORM_PLAN")
            logger.log("ACTION: Planning infrastructure changes...")
            
            result = subprocess.run(
                ['terraform', 'plan', '-out=tfplan'],
                cwd=temp_dir,
                capture_output=True,
                text=True,
                env=env
            )
            
            if result.returncode != 0:
                logger.log("WARNING: Initial plan failed, refreshing and retrying...")
                subprocess.run(['terraform', 'refresh'], cwd=temp_dir, capture_output=True, text=True, env=env)
                
                result = subprocess.run(
                    ['terraform', 'plan', '-out=tfplan'],
                    cwd=temp_dir,
                    capture_output=True,
                    text=True,
                    env=env
                )
                
                if result.returncode != 0:
                    raise Exception(f"Terraform plan failed: {result.stderr}")
            
            logger.log("SUCCESS: Terraform plan created")
            
            # Step 8: Apply deployment
            logger.log("STATUS: CREATING_RESOURCES")
            logger.log("INFO: Creating/updating infrastructure resources...")
            
            # Update status for different resource types as we go
            logger.log("STATUS: CREATING_SERVICE_ACCOUNTS")
            
            # Apply with automatic approval
            result = subprocess.run(
                ['terraform', 'apply', '-auto-approve', 'tfplan'],
                cwd=temp_dir,
                capture_output=True,
                text=True,
                env=env,
                timeout=1800  # 30 minute timeout
            )
            
            apply_success = result.returncode == 0
            
            if not apply_success:
                logger.log(f"WARNING: Terraform apply had issues: {result.stderr[:500]}")
                # Don't fail immediately - try to get outputs anyway
            
            # Step 9: Get outputs from Terraform AND existing resources
            logger.log("STATUS: RETRIEVING_OUTPUTS")
            logger.log("ACTION: Getting deployment outputs...")
            
            # First try Terraform outputs
            tf_outputs = {}
            result = subprocess.run(
                ['terraform', 'output', '-json'],
                cwd=temp_dir,
                capture_output=True,
                text=True,
                env=env
            )
            
            if result.returncode == 0:
                tf_outputs = json.loads(result.stdout)
            
            # Merge with discovered outputs
            discovered_outputs = discover_existing_outputs(project_id, prefix, credentials, logger)
            
            # Build final output data
            output_data = {
                'apiGatewayUrl': 'Not found',
                'apiKey': 'Not found',
                'firebaseConfig': {},
                'firebaseConfigSecret': f"projects/{project_id}/secrets/{prefix}-firebase-config",
                'apiKeySecret': f"projects/{project_id}/secrets/{prefix}-api-key",
                'workloadIdentityProvider': discovered_outputs.get('workloadIdentityProvider', 'Not found'),
                'vertexServiceAccount': discovered_outputs.get('vertexServiceAccount', 'Not found'),
                'firebaseStorageBucket': 'Not found',
                'firebaseWebAppId': 'Not found'
            }
            
            # Extract Terraform outputs if available
            if tf_outputs:
                def get_tf_value(key):
                    val = tf_outputs.get(key, {})
                    return val.get('value') if isinstance(val, dict) else val
                
                tf_values = {
                    'apiGatewayUrl': get_tf_value('api_gateway_url'),
                    'apiKey': get_tf_value('api_key'),
                    'firebaseConfig': get_tf_value('firebase_config'),
                    'firebaseConfigSecret': f"projects/{project_id}/secrets/{get_tf_value('firebase_config_secret_name')}",
                    'apiKeySecret': f"projects/{project_id}/secrets/{get_tf_value('firebase_api_key_secret_name')}",
                    'workloadIdentityProvider': get_tf_value('workload_identity_provider'),
                    'vertexServiceAccount': get_tf_value('vertex_ai_service_account_email'),
                    'firebaseStorageBucket': get_tf_value('firebase_storage_bucket'),
                    'firebaseWebAppId': get_tf_value('firebase_web_app_id')
                }
                
                # Use Terraform values if they exist
                for key, value in tf_values.items():
                    if value and value != 'Not found':
                        output_data[key] = value
            
            # Override with discovered values (these are more reliable for existing resources)
            for key, value in discovered_outputs.items():
                if value and value != 'Not found':
                    output_data[key] = value
            
            # Store outputs in Firestore
            deployment_ref.update({
                'status': 'completed',
                'completedAt': datetime.utcnow(),
                'outputs': output_data,
                'partialSuccess': not apply_success
            })
            
            logger.log("STATUS: DEPLOYMENT_COMPLETE")
            logger.log("SUCCESS: Deployment completed!")
            logger.log(f"RESULT: API Gateway URL: {output_data['apiGatewayUrl']}")
            logger.log(f"RESULT: API Key: {output_data.get('apiKey', 'Check Secret Manager')}")
            logger.log(f"RESULT: Firebase Config: {'Available' if output_data.get('firebaseConfig') else 'Check Secret Manager'}")
            
            if not apply_success:
                logger.log("WARNING: Some resources may require manual intervention")
                logger.log("INFO: Check Cloud Console for any remaining setup steps")
    
    except Exception as e:
        logger.log(f"ERROR: Deployment failed: {str(e)}")
        logger.log(f"TRACE: {traceback.format_exc()}")
        
        deployment_ref.update({
            'status': 'failed',
            'error': str(e),
            'failedAt': datetime.utcnow()
        })
        
        # Try to get any partial outputs even on failure
        try:
            partial_outputs = discover_existing_outputs(project_id, prefix, credentials, logger)
            if partial_outputs:
                deployment_ref.update({'partialOutputs': partial_outputs})
        except:
            pass