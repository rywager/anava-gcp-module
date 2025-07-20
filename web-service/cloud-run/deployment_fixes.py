"""
Deployment fixes for Anava service v2.3.24
Implements smart resource handling, Firestore logging, and output discovery
"""

import json
import subprocess
import time
from datetime import datetime
from typing import Dict, Optional, List, Tuple

# Resource cleanup configuration
RESOURCES_TO_CLEAN = {
    'api_gateway': True,      # Must delete to get new URL
    'api_gateway_config': True, # Must delete API configs too
    'api_keys': True,         # Must delete to get new key
    'secrets': False,         # Can update existing
    'service_accounts': False, # Keep existing - no outputs needed
    'buckets': False,         # Keep existing
    'iam_bindings': False,    # Keep existing
    'cloud_functions': True,  # Delete to ensure fresh deployment
}

class FirestoreLogger:
    """Firestore-based logging system to replace Redis"""
    
    def __init__(self, db, deployment_id: str):
        self.db = db
        self.deployment_id = deployment_id
        self.deployment_ref = db.collection('deployments').document(deployment_id)
        self.logs_collection = self.deployment_ref.collection('logs')
        self.current_step = None
        
    def log(self, message: str, step_info: Dict = None):
        """Log message to Firestore"""
        timestamp = datetime.utcnow()
        log_entry = {
            'timestamp': timestamp,
            'message': message,
            'step_info': step_info or {}
        }
        
        # Add to logs collection
        self.logs_collection.add(log_entry)
        
        # Handle status messages
        if message.startswith('STATUS:'):
            self._update_deployment_status(message, timestamp)
        
        # Print for Cloud Run logs
        print(f"[{self.deployment_id}] {timestamp.strftime('%H:%M:%S')} - {message}")
    
    def _update_deployment_status(self, message: str, timestamp: datetime):
        """Update deployment status based on STATUS messages"""
        status = message.split('STATUS:')[1].strip()
        
        # Map status to step IDs
        status_to_step = {
            'ENABLING_APIS': 'enabling-apis',
            'CLEANING_RESOURCES': 'cleaning',
            'SETTING_PERMISSIONS': 'permissions',
            'PREPARING_TERRAFORM': 'terraform-init',
            'TERRAFORM_INIT': 'terraform-init',
            'TERRAFORM_PLAN': 'terraform-init',
            'CREATING_RESOURCES': 'creating-resources',
            'CREATING_SERVICE_ACCOUNTS': 'service-accounts',
            'CREATING_SECRETS': 'secrets',
            'CREATING_STORAGE': 'storage',
            'CREATING_FIRESTORE': 'firestore',
            'CREATING_CLOUD_FUNCTIONS': 'functions',
            'CREATING_API_GATEWAY': 'api-gateway',
            'RETRIEVING_OUTPUTS': 'outputs',
            'DEPLOYMENT_COMPLETE': 'complete'
        }
        
        if status in status_to_step:
            step_id = status_to_step[status]
            
            # Update previous step as completed
            if self.current_step and self.current_step != step_id:
                self.deployment_ref.update({
                    f'steps.{self.current_step}.status': 'completed',
                    f'steps.{self.current_step}.completedAt': timestamp
                })
            
            # Set new current step
            self.current_step = step_id
            self.deployment_ref.update({
                'currentStep': step_id,
                f'steps.{step_id}.status': 'active',
                f'steps.{step_id}.startedAt': timestamp
            })


def cleanup_blocking_resources(project_id: str, prefix: str, logger: FirestoreLogger) -> int:
    """Selectively clean only resources that block output generation"""
    cleaned = 0
    
    logger.log("ACTION: Cleaning only resources that block output generation...")
    
    # 1. Delete API Gateway and configs (to get new URL)
    if RESOURCES_TO_CLEAN['api_gateway']:
        try:
            # List and delete gateways
            list_cmd = ['gcloud', 'api-gateway', 'gateways', 'list',
                       '--format=value(name)', f'--project={project_id}']
            result = subprocess.run(list_cmd, capture_output=True, text=True)
            
            if result.returncode == 0 and result.stdout:
                for gateway in result.stdout.strip().split('\n'):
                    if prefix in gateway:
                        logger.log(f"CLEANING: API Gateway {gateway}")
                        location = 'us-central1'  # Default location
                        cmd = ['gcloud', 'api-gateway', 'gateways', 'delete', gateway,
                               f'--location={location}', f'--project={project_id}', '--quiet']
                        result = subprocess.run(cmd, capture_output=True, text=True)
                        if result.returncode == 0:
                            logger.log(f"CLEANED: Removed API Gateway {gateway}")
                            cleaned += 1
            
            # Delete API configs
            list_cmd = ['gcloud', 'api-gateway', 'api-configs', 'list',
                       '--format=value(name)', f'--project={project_id}']
            result = subprocess.run(list_cmd, capture_output=True, text=True)
            
            if result.returncode == 0 and result.stdout:
                for config in result.stdout.strip().split('\n'):
                    if prefix in config:
                        api_name = config.split('/')[0]  # Extract API name
                        config_name = config.split('/')[-1]  # Extract config name
                        logger.log(f"CLEANING: API Config {config}")
                        cmd = ['gcloud', 'api-gateway', 'api-configs', 'delete', config_name,
                               f'--api={api_name}', f'--project={project_id}', '--quiet']
                        result = subprocess.run(cmd, capture_output=True, text=True)
                        if result.returncode == 0:
                            logger.log(f"CLEANED: Removed API Config {config}")
                            cleaned += 1
            
            # Delete APIs
            list_cmd = ['gcloud', 'api-gateway', 'apis', 'list',
                       '--format=value(name)', f'--project={project_id}']
            result = subprocess.run(list_cmd, capture_output=True, text=True)
            
            if result.returncode == 0 and result.stdout:
                for api in result.stdout.strip().split('\n'):
                    if prefix in api:
                        logger.log(f"CLEANING: API {api}")
                        cmd = ['gcloud', 'api-gateway', 'apis', 'delete', api,
                               f'--project={project_id}', '--quiet']
                        result = subprocess.run(cmd, capture_output=True, text=True)
                        if result.returncode == 0:
                            logger.log(f"CLEANED: Removed API {api}")
                            cleaned += 1
                            
        except Exception as e:
            logger.log(f"WARNING: Error cleaning API Gateway: {str(e)[:200]}")
    
    # 2. Delete API Keys (to get new key) - but we'll actually query existing ones
    # Skip API key deletion - we'll retrieve existing or create new
    
    # 3. Delete Cloud Functions (for fresh deployment)
    if RESOURCES_TO_CLEAN['cloud_functions']:
        try:
            functions = [f"{prefix}-device-auth", f"{prefix}-tvm"]
            regions = ['us-central1', 'us-east1', 'us-west1']  # Common regions
            
            for func in functions:
                for region in regions:
                    cmd = ['gcloud', 'functions', 'delete', func,
                           f'--region={region}', f'--project={project_id}', '--quiet']
                    result = subprocess.run(cmd, capture_output=True, text=True)
                    if result.returncode == 0:
                        logger.log(f"CLEANED: Removed function {func} in {region}")
                        cleaned += 1
                        break  # Found in this region, skip others
                        
        except Exception as e:
            logger.log(f"WARNING: Error cleaning functions: {str(e)[:200]}")
    
    # Log what we're NOT cleaning
    logger.log("INFO: Keeping existing service accounts - they don't need recreation")
    logger.log("INFO: Keeping existing storage buckets - can be reused")
    logger.log("INFO: Keeping existing IAM bindings - already configured")
    
    if cleaned > 0:
        logger.log(f"SUCCESS: Cleaned {cleaned} blocking resources")
        logger.log("INFO: Waiting 15 seconds for deletions to propagate...")
        time.sleep(15)
    else:
        logger.log("INFO: No blocking resources found to clean")
    
    return cleaned


def discover_existing_outputs(project_id: str, prefix: str, credentials, logger: FirestoreLogger) -> Dict:
    """Discover outputs from existing resources"""
    
    logger.log("ACTION: Discovering outputs from existing resources...")
    outputs = {}
    
    # 1. Get API Gateway URL (if exists)
    try:
        list_cmd = ['gcloud', 'api-gateway', 'gateways', 'list',
                   '--format=json', f'--project={project_id}']
        result = subprocess.run(list_cmd, capture_output=True, text=True)
        
        if result.returncode == 0 and result.stdout:
            gateways = json.loads(result.stdout)
            for gateway in gateways:
                if prefix in gateway.get('name', ''):
                    # Get gateway details
                    gateway_name = gateway['name'].split('/')[-1]
                    location = gateway['name'].split('/')[3]
                    
                    describe_cmd = ['gcloud', 'api-gateway', 'gateways', 'describe', gateway_name,
                                   f'--location={location}', f'--project={project_id}', '--format=json']
                    result = subprocess.run(describe_cmd, capture_output=True, text=True)
                    
                    if result.returncode == 0:
                        details = json.loads(result.stdout)
                        outputs['apiGatewayUrl'] = details.get('defaultHostname', '')
                        if outputs['apiGatewayUrl']:
                            outputs['apiGatewayUrl'] = f"https://{outputs['apiGatewayUrl']}"
                        logger.log(f"FOUND: API Gateway URL: {outputs['apiGatewayUrl']}")
                        break
                        
    except Exception as e:
        logger.log(f"WARNING: Could not discover API Gateway: {str(e)[:200]}")
    
    # 2. Get or Create API Key
    try:
        # Check if API key exists in Secret Manager
        secret_name = f"{prefix}-api-key"
        get_secret_cmd = ['gcloud', 'secrets', 'versions', 'access', 'latest',
                         f'--secret={secret_name}', f'--project={project_id}']
        result = subprocess.run(get_secret_cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            outputs['apiKey'] = result.stdout.strip()
            logger.log(f"FOUND: API Key in Secret Manager")
        else:
            # Create new API key
            logger.log("INFO: Creating new API Key...")
            create_key_cmd = ['gcloud', 'alpha', 'services', 'api-keys', 'create',
                            f'--display-name={prefix}-api-key',
                            f'--project={project_id}', '--format=json']
            result = subprocess.run(create_key_cmd, capture_output=True, text=True)
            
            if result.returncode == 0:
                key_data = json.loads(result.stdout)
                key_string = key_data.get('response', {}).get('keyString', '')
                if key_string:
                    outputs['apiKey'] = key_string
                    logger.log(f"CREATED: New API Key")
                    
                    # Store in Secret Manager
                    create_secret_cmd = ['gcloud', 'secrets', 'create', secret_name,
                                       f'--data-file=-', f'--project={project_id}']
                    subprocess.run(create_secret_cmd, input=key_string.encode(), 
                                 capture_output=True, text=True)
                    
    except Exception as e:
        logger.log(f"WARNING: Could not get/create API Key: {str(e)[:200]}")
    
    # 3. Get Firebase Configuration
    try:
        # List Firebase web apps
        list_apps_cmd = ['gcloud', 'firebase', 'apps:list', '--project', project_id, '--format=json']
        result = subprocess.run(list_apps_cmd, capture_output=True, text=True)
        
        if result.returncode == 0 and result.stdout:
            apps = json.loads(result.stdout)
            web_app = next((app for app in apps if app.get('platform') == 'WEB'), None)
            
            if web_app:
                app_id = web_app.get('appId', '')
                
                # Get web app config
                config_cmd = ['gcloud', 'firebase', 'apps:sdkconfig', 'WEB', app_id,
                            '--project', project_id]
                result = subprocess.run(config_cmd, capture_output=True, text=True)
                
                if result.returncode == 0 and result.stdout:
                    # Parse JavaScript config
                    import re
                    config_match = re.search(r'firebase\.initializeApp\(({[^}]+})\)', result.stdout)
                    if config_match:
                        config_str = config_match.group(1)
                        # Convert JS object to JSON
                        config_str = re.sub(r'(\w+):', r'"\1":', config_str)
                        config_str = config_str.replace("'", '"')
                        outputs['firebaseConfig'] = json.loads(config_str)
                        logger.log(f"FOUND: Firebase configuration for app {app_id}")
                        
    except Exception as e:
        logger.log(f"WARNING: Could not get Firebase config: {str(e)[:200]}")
    
    # 4. Set standard secret paths
    outputs['firebaseConfigSecret'] = f"projects/{project_id}/secrets/{prefix}-firebase-config"
    outputs['apiKeySecret'] = f"projects/{project_id}/secrets/{prefix}-api-key"
    
    # 5. Get other standard values
    outputs['workloadIdentityProvider'] = f"projects/{project_id}/locations/global/workloadIdentityPools/{prefix}-wi-pool/providers/{prefix}-wi-provider"
    outputs['vertexServiceAccount'] = f"{prefix}-vertex-ai-sa@{project_id}.iam.gserviceaccount.com"
    
    return outputs


def ensure_service_account_permissions(project_id: str, prefix: str, logger: FirestoreLogger):
    """Ensure service accounts exist and have correct permissions"""
    
    service_accounts = [
        {
            'name': f"{prefix}-device-auth-sa",
            'display_name': f"{prefix} Device Auth Service Account",
            'roles': ['roles/datastore.user', 'roles/iam.serviceAccountTokenCreator']
        },
        {
            'name': f"{prefix}-tvm-sa",
            'display_name': f"{prefix} Token Vending Machine SA",
            'roles': ['roles/iam.serviceAccountTokenCreator', 'roles/datastore.user']
        },
        {
            'name': f"{prefix}-vertex-ai-sa",
            'display_name': f"{prefix} Vertex AI Service Account",
            'roles': ['roles/aiplatform.user', 'roles/storage.objectUser']
        },
        {
            'name': f"{prefix}-apigw-invoker-sa",
            'display_name': f"{prefix} API Gateway Invoker SA",
            'roles': ['roles/cloudfunctions.invoker']
        }
    ]
    
    for sa in service_accounts:
        sa_email = f"{sa['name']}@{project_id}.iam.gserviceaccount.com"
        
        # Check if SA exists
        check_cmd = ['gcloud', 'iam', 'service-accounts', 'describe', sa_email,
                    f'--project={project_id}']
        result = subprocess.run(check_cmd, capture_output=True, text=True)
        
        if result.returncode != 0:
            # Create SA
            logger.log(f"CREATING: Service account {sa['name']}")
            create_cmd = ['gcloud', 'iam', 'service-accounts', 'create', sa['name'],
                         f'--display-name={sa["display_name"]}',
                         f'--project={project_id}']
            subprocess.run(create_cmd, capture_output=True, text=True)
        
        # Ensure roles
        for role in sa['roles']:
            add_binding_cmd = ['gcloud', 'projects', 'add-iam-policy-binding', project_id,
                             f'--member=serviceAccount:{sa_email}',
                             f'--role={role}', '--condition=None']
            subprocess.run(add_binding_cmd, capture_output=True, text=True)
        
        logger.log(f"CONFIGURED: Service account {sa['name']} with required permissions")


def handle_terraform_imports(temp_dir: str, project_id: str, prefix: str, env: Dict, logger: FirestoreLogger) -> bool:
    """Import existing resources into Terraform state"""
    
    logger.log("ACTION: Checking for resources to import...")
    imports_needed = []
    
    # Check which resources exist and need importing
    resources_to_check = [
        {
            'type': 'service_account',
            'name': f'{prefix}-device-auth-sa',
            'import_cmd': f'module.anava.google_service_account.device_auth {prefix}-device-auth-sa@{project_id}.iam.gserviceaccount.com'
        },
        {
            'type': 'service_account', 
            'name': f'{prefix}-tvm-sa',
            'import_cmd': f'module.anava.google_service_account.tvm {prefix}-tvm-sa@{project_id}.iam.gserviceaccount.com'
        },
        {
            'type': 'service_account',
            'name': f'{prefix}-vertex-ai-sa', 
            'import_cmd': f'module.anava.google_service_account.vertex_ai {prefix}-vertex-ai-sa@{project_id}.iam.gserviceaccount.com'
        },
        {
            'type': 'storage_bucket',
            'name': f'{project_id}-{prefix}-firebase',
            'import_cmd': f'module.anava.google_storage_bucket.firebase_storage {project_id}-{prefix}-firebase'
        },
        {
            'type': 'storage_bucket',
            'name': f'{project_id}-{prefix}-function-source',
            'import_cmd': f'module.anava.google_storage_bucket.cloud_functions_source {project_id}-{prefix}-function-source'
        }
    ]
    
    for resource in resources_to_check:
        # Check if resource exists
        if resource['type'] == 'service_account':
            check_cmd = ['gcloud', 'iam', 'service-accounts', 'describe',
                        f"{resource['name']}@{project_id}.iam.gserviceaccount.com",
                        f'--project={project_id}']
        elif resource['type'] == 'storage_bucket':
            check_cmd = ['gsutil', 'ls', f"gs://{resource['name']}"]
        else:
            continue
            
        result = subprocess.run(check_cmd, capture_output=True, text=True)
        if result.returncode == 0:
            imports_needed.append(resource['import_cmd'])
            logger.log(f"FOUND: Existing {resource['type']} {resource['name']}")
    
    # Run imports
    if imports_needed:
        logger.log(f"ACTION: Importing {len(imports_needed)} existing resources...")
        for import_cmd in imports_needed:
            full_cmd = ['terraform', 'import'] + import_cmd.split()
            result = subprocess.run(full_cmd, cwd=temp_dir, capture_output=True, text=True, env=env)
            if result.returncode == 0:
                logger.log(f"IMPORTED: {import_cmd.split()[-1]}")
            else:
                logger.log(f"WARNING: Failed to import {import_cmd.split()[-1]}: {result.stderr[:200]}")
        
        return True
    
    return False