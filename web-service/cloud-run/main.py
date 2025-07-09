#!/usr/bin/env python3
"""
Fixed deployment with CLEAR logging and UI updates
"""

import os
import json
import uuid
import subprocess
import tempfile
from datetime import datetime
from typing import Dict, Any, Optional

from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_cors import CORS
from google.auth.transport import requests
from google.oauth2 import id_token
from google.cloud import firestore, secretmanager
import google.auth
import google.auth.transport.requests
import google_auth_oauthlib.flow
from googleapiclient import discovery
import redis

app = Flask(__name__)
app.secret_key = os.environ.get('SESSION_SECRET', 'dev-secret-change-in-prod')
CORS(app, origins=['https://anava.ai', 'http://localhost:5000'])

# Version info
VERSION = "2.1.0"
COMMIT_SHA = os.environ.get('COMMIT_SHA', 'dev')
BUILD_TIME = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

# Configuration
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT', 'anava-ai')
CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')
REDIRECT_URI = os.environ.get('REDIRECT_URI', 'http://localhost:5000/callback')

# Redis for job tracking - with fallback
REDIS_HOST = os.environ.get('REDIS_HOST', 'localhost')
REDIS_PORT = int(os.environ.get('REDIS_PORT', 6379))

def get_redis_client():
    """Get Redis client with connection retry"""
    try:
        client = redis.StrictRedis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            decode_responses=True,
            socket_connect_timeout=2,
            socket_timeout=2,
            retry_on_timeout=True,
            retry_on_error=[ConnectionError, TimeoutError],
            health_check_interval=30
        )
        client.ping()
        return client
    except Exception as e:
        print(f"Redis connection failed: {e}")
        return None

# Initialize Redis
redis_client = get_redis_client()
REDIS_AVAILABLE = redis_client is not None

if not REDIS_AVAILABLE:
    print(f"WARNING: Redis not available at {REDIS_HOST}:{REDIS_PORT}")
else:
    print(f"Redis connected at {REDIS_HOST}:{REDIS_PORT}")

# Firestore for deployment records
db = firestore.Client()

# OAuth2 configuration
oauth_config = {
    "web": {
        "client_id": CLIENT_ID,
        "client_secret": CLIENT_SECRET,
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
        "redirect_uris": [REDIRECT_URI]
    }
}

@app.route('/')
def index():
    return render_template('index.html', client_id=CLIENT_ID)

@app.route('/health')
def health():
    redis_status = 'unavailable'
    queue_length = -1
    
    if REDIS_AVAILABLE and redis_client:
        try:
            redis_client.ping()
            redis_status = 'connected'
            queue_length = redis_client.llen('deployment_queue')
        except Exception as e:
            redis_status = f'error: {str(e)}'
            queue_length = -1
    
    return jsonify({
        'status': 'healthy',
        'service': 'anava-deploy',
        'version': VERSION,
        'commit': COMMIT_SHA,
        'build_time': BUILD_TIME,
        'oauth_configured': bool(CLIENT_ID and CLIENT_SECRET),
        'redirect_uri': REDIRECT_URI,
        'redis_status': redis_status,
        'redis_available': REDIS_AVAILABLE,
        'queue_length': queue_length,
        'timestamp': datetime.utcnow().isoformat()
    })

@app.route('/api/version')
def get_version():
    return jsonify({
        'version': VERSION,
        'commit': COMMIT_SHA,
        'build_time': BUILD_TIME,
        'features': {
            'firebase_storage_fix': True,
            'progress_tracking': True,
            'enhanced_logging': True,
            'storage_location_selector': True
        }
    })

@app.route('/login')
def login():
    flow = google_auth_oauthlib.flow.Flow.from_client_config(
        oauth_config,
        scopes=[
            'openid',
            'email', 
            'profile',
            'https://www.googleapis.com/auth/cloud-platform',
            'https://www.googleapis.com/auth/cloudplatformprojects'
        ]
    )
    flow.redirect_uri = REDIRECT_URI
    
    authorization_url, state = flow.authorization_url(
        access_type='offline',
        include_granted_scopes='true',
        prompt='consent'
    )
    
    session['state'] = state
    return redirect(authorization_url)

@app.route('/callback')
def callback():
    try:
        error = request.args.get('error')
        if error:
            return jsonify({
                'error': 'OAuth error from Google',
                'details': error,
                'description': request.args.get('error_description', 'No description')
            }), 400
        
        state = session.get('state')
        code = request.args.get('code')
        
        if not state or not code:
            return jsonify({'error': 'Invalid OAuth callback'}), 400
        
        flow = google_auth_oauthlib.flow.Flow.from_client_config(
            oauth_config,
            scopes=None,
            state=state
        )
        flow.redirect_uri = REDIRECT_URI
        
        auth_response = request.url
        if auth_response.startswith('http://'):
            auth_response = auth_response.replace('http://', 'https://', 1)
        
        flow.fetch_token(authorization_response=auth_response)
        
        credentials = flow.credentials
        session['credentials'] = {
            'token': credentials.token,
            'refresh_token': credentials.refresh_token,
            'token_uri': credentials.token_uri,
            'client_id': credentials.client_id,
            'client_secret': credentials.client_secret,
            'scopes': credentials.scopes
        }
        
        # Get user info
        if hasattr(credentials, 'id_token') and credentials.id_token:
            id_info = id_token.verify_oauth2_token(
                credentials.id_token,
                requests.Request(),
                CLIENT_ID
            )
        else:
            userinfo_request = requests.get(
                'https://www.googleapis.com/oauth2/v2/userinfo',
                headers={'Authorization': f'Bearer {credentials.token}'}
            )
            if userinfo_request.status_code == 200:
                id_info = userinfo_request.json()
            else:
                id_info = {'email': 'user@example.com', 'name': 'User'}
        
        session['user_info'] = {
            'email': id_info['email'],
            'name': id_info.get('name', 'User')
        }
        
        return redirect(url_for('dashboard'))
        
    except Exception as e:
        return jsonify({
            'error': 'OAuth callback failed',
            'message': str(e)
        }), 500

@app.route('/dashboard')
def dashboard():
    if 'user_info' not in session:
        return redirect(url_for('login'))
    return render_template('dashboard.html', user=session['user_info'])

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('index'))

@app.route('/api/projects')
def list_projects():
    if 'credentials' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        credentials = google.oauth2.credentials.Credentials(**session['credentials'])
        service = discovery.build('cloudresourcemanager', 'v1', credentials=credentials)
        response = service.projects().list().execute()
        
        projects = []
        for project in response.get('projects', []):
            if project['lifecycleState'] == 'ACTIVE':
                projects.append({
                    'projectId': project['projectId'],
                    'name': project.get('name', project['projectId']),
                    'projectNumber': project['projectNumber']
                })
        
        return jsonify({'projects': projects})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/validate-project', methods=['POST'])
def validate_project():
    if 'credentials' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    project_id = data.get('projectId')
    
    if not project_id:
        return jsonify({'error': 'Project ID required'}), 400
    
    try:
        credentials = google.oauth2.credentials.Credentials(**session['credentials'])
        
        validation_results = {
            'projectId': project_id,
            'valid': True,
            'issues': [],
            'warnings': []
        }
        
        # Check billing
        billing_service = discovery.build('cloudbilling', 'v1', credentials=credentials)
        billing_info = billing_service.projects().getBillingInfo(
            name=f'projects/{project_id}'
        ).execute()
        
        if not billing_info.get('billingEnabled'):
            validation_results['valid'] = False
            validation_results['issues'].append('Billing is not enabled for this project')
        
        # Check required APIs
        service_usage = discovery.build('serviceusage', 'v1', credentials=credentials)
        required_apis = [
            'cloudfunctions.googleapis.com',
            'cloudbuild.googleapis.com',
            'firestore.googleapis.com',
            'firebase.googleapis.com',
            'apigateway.googleapis.com',
            'servicecontrol.googleapis.com',
            'servicemanagement.googleapis.com',
            'secretmanager.googleapis.com',
            'iam.googleapis.com'
        ]
        
        try:
            # Get list of enabled services
            enabled_services = service_usage.services().list(
                parent=f'projects/{project_id}',
                filter='state:ENABLED'
            ).execute()
            
            enabled_api_names = set()
            for service in enabled_services.get('services', []):
                api_name = service['name'].split('/')[-1]
                enabled_api_names.add(api_name)
            
            # Check which required APIs are missing
            missing_apis = []
            for api in required_apis:
                if api not in enabled_api_names:
                    missing_apis.append(api)
            
            if missing_apis:
                validation_results['warnings'].append({
                    'message': f'The following APIs will be enabled during deployment: {", ".join(missing_apis)}',
                    'type': 'info'
                })
        except Exception as e:
            validation_results['warnings'].append({
                'message': 'Could not check enabled APIs. They will be enabled during deployment if needed.',
                'type': 'info'
            })
        
        return jsonify(validation_results)
    
    except Exception as e:
        return jsonify({
            'projectId': project_id if 'project_id' in locals() else 'unknown',
            'valid': False,
            'issues': [f'Validation failed: {str(e)}'],
            'warnings': [],
            'error': str(e)
        }), 200

def run_single_deployment(job_data):
    """Process a single deployment with CLEAR logging"""
    deployment_id = job_data['deploymentId']
    
    deployment_ref = db.collection('deployments').document(deployment_id)
    deployment_ref.update({
        'status': 'running',
        'startedAt': datetime.utcnow()
    })
    
    def log(message, step_info=None):
        timestamp = datetime.utcnow().strftime('%H:%M:%S')
        log_entry = f"{timestamp} - {message}"
        if REDIS_AVAILABLE and redis_client:
            try:
                redis_client.lpush(f'deployment_logs:{deployment_id}', log_entry)
                redis_client.expire(f'deployment_logs:{deployment_id}', 86400)
                
                # Store step information separately if provided
                if step_info:
                    redis_client.hset(f'deployment_steps:{deployment_id}', step_info['id'], json.dumps(step_info))
                    redis_client.expire(f'deployment_steps:{deployment_id}', 86400)
                
                # Track step progress for STATUS messages
                if message.startswith('STATUS:'):
                    status = message.split('STATUS:')[1].strip()
                    
                    # Map status to step IDs that match the dashboard
                    status_to_step = {
                        'ENABLING_APIS': 'enabling-apis',
                        'SETTING_PERMISSIONS': 'permissions',
                        'PREPARING_TERRAFORM': 'terraform-init',
                        'TERRAFORM_INIT': 'terraform-init',
                        'TERRAFORM_PLAN': 'terraform-init',
                        'IMPORTING_EXISTING': 'terraform-init',
                        'CREATING_RESOURCES': 'terraform-init',
                        'CREATING_SERVICE_ACCOUNTS': 'service-accounts',
                        'CREATING_SECRETS': 'secrets',
                        'CREATING_STORAGE': 'storage',
                        'CREATING_FIRESTORE': 'firestore',
                        'CREATING_CLOUD_FUNCTIONS': 'functions',
                        'CREATING_API_GATEWAY': 'api-gateway',
                        'CREATING_WORKLOAD_IDENTITY': 'api-gateway',
                        'RETRIEVING_OUTPUTS': 'api-gateway',
                        'DEPLOYMENT_COMPLETE': 'outputs'
                    }
                    
                    if status in status_to_step:
                        step_id = status_to_step[status]
                        
                        # Get current step
                        current = redis_client.get(f'deployment_current_step:{deployment_id}')
                        if current and current.decode('utf-8') != step_id:
                            prev_step = current.decode('utf-8')
                            # Mark previous step as completed
                            redis_client.hset(
                                f'deployment_step_status:{deployment_id}',
                                prev_step,
                                json.dumps({'status': 'completed', 'timestamp': datetime.utcnow().isoformat()})
                            )
                        
                        # Set new current step
                        redis_client.set(f'deployment_current_step:{deployment_id}', step_id)
                        redis_client.expire(f'deployment_current_step:{deployment_id}', 86400)
                        
                        # Mark step as active
                        redis_client.hset(
                            f'deployment_step_status:{deployment_id}',
                            step_id,
                            json.dumps({'status': 'active', 'timestamp': datetime.utcnow().isoformat()})
                        )
                        redis_client.expire(f'deployment_step_status:{deployment_id}', 86400)
                        
            except:
                pass  # Fallback to just printing
        print(f"[{deployment_id}] {message}")
    
    try:
        # CLEAR STATUS MESSAGES
        log("STATUS: DEPLOYMENT_STARTED")
        log(f"PROJECT: {job_data['projectId']}")
        log(f"REGION: {job_data['region']}")
        log(f"PREFIX: {job_data['prefix']}")
        
        # Step 1: Enable APIs
        log("STATUS: ENABLING_APIS")
        log("ACTION: Enabling required Google Cloud APIs...")
        project_id = job_data['projectId']
        prefix = job_data['prefix']
        
        # Create auth header for API calls
        credentials = google.oauth2.credentials.Credentials(**job_data['credentials'])
        credentials.refresh(google.auth.transport.requests.Request())
        
        # Enable Cloud Build API to fix the permission error
        required_apis = [
            'cloudbuild.googleapis.com',
            'cloudfunctions.googleapis.com',
            'firebase.googleapis.com',
            'firestore.googleapis.com',
            'apigateway.googleapis.com',
            'servicecontrol.googleapis.com',
            'servicemanagement.googleapis.com',
            'secretmanager.googleapis.com',
            'iam.googleapis.com'
        ]
        
        import requests
        headers = {'Authorization': f'Bearer {credentials.token}', 'Content-Type': 'application/json'}
        
        for i, api in enumerate(required_apis, 1):
            try:
                log(f"PROGRESS: Enabling API {i}/{len(required_apis)}: {api}")
                enable_url = f'https://serviceusage.googleapis.com/v1/projects/{project_id}/services/{api}:enable'
                response = requests.post(enable_url, headers=headers, json={})
                if response.status_code in [200, 201]:
                    log(f"SUCCESS: Enabled {api}")
                elif response.status_code == 409:
                    log(f"INFO: {api} already enabled")
                else:
                    log(f"WARNING: Failed to enable {api}: {response.status_code}")
            except Exception as e:
                log(f"ERROR: Failed to enable {api}: {str(e)[:100]}")
        
        # Step 2: Set up permissions
        log("STATUS: SETTING_PERMISSIONS")
        log("ACTION: Configuring service accounts and permissions...")
        
        # Get project number for service agents
        try:
            project_info_url = f'https://cloudresourcemanager.googleapis.com/v1/projects/{project_id}'
            response = requests.get(project_info_url, headers=headers)
            if response.status_code == 200:
                project_number = response.json().get('projectNumber')
                log(f"INFO: Project number: {project_number}")
            else:
                log(f"WARNING: Could not get project number: {response.status_code}")
                project_number = None
        except Exception as e:
            log(f"WARNING: Error getting project number: {str(e)[:100]}")
            project_number = None
        
        # Grant permissions to service agents
        if project_number:
            # Service agents that need permissions
            service_agents = [
                {
                    'email': f'service-{project_number}@gcf-admin-robot.iam.gserviceaccount.com',
                    'role': 'roles/storage.admin',
                    'description': 'Cloud Functions service agent'
                },
                {
                    'email': f'service-{project_number}@gcp-sa-apigateway-mgmt.iam.gserviceaccount.com',
                    'role': 'roles/apigateway.serviceAgent',
                    'description': 'API Gateway service agent'
                }
            ]
            
            # Get current IAM policy
            try:
                iam_policy_url = f'https://cloudresourcemanager.googleapis.com/v1/projects/{project_id}:getIamPolicy'
                response = requests.post(iam_policy_url, headers=headers, json={})
                
                if response.status_code == 200:
                    policy = response.json()
                    policy_updated = False
                    
                    # Add permissions for each service agent
                    for agent in service_agents:
                        log(f"INFO: Granting {agent['role']} to {agent['description']}...")
                        
                        # Check if binding exists
                        binding_exists = False
                        member = f"serviceAccount:{agent['email']}"
                        
                        for binding in policy.get('bindings', []):
                            if binding['role'] == agent['role']:
                                if member not in binding.get('members', []):
                                    binding['members'].append(member)
                                    policy_updated = True
                                binding_exists = True
                                break
                        
                        if not binding_exists:
                            policy['bindings'].append({
                                'role': agent['role'],
                                'members': [member]
                            })
                            policy_updated = True
                    
                    # Also grant Cloud Build permissions
                    # Cloud Build SA format: PROJECT_NUMBER@cloudbuild.gserviceaccount.com
                    build_sa = f"{project_number}@cloudbuild.gserviceaccount.com"
                    build_member = f"serviceAccount:{build_sa}"
                    
                    # Add Cloud Functions Developer role for Cloud Build
                    build_role = 'roles/cloudfunctions.developer'
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
                    
                    # Update IAM policy if needed
                    if policy_updated:
                        set_iam_url = f'https://cloudresourcemanager.googleapis.com/v1/projects/{project_id}:setIamPolicy'
                        response = requests.post(set_iam_url, headers=headers, json={'policy': policy})
                        
                        if response.status_code == 200:
                            log("SUCCESS: All service permissions granted")
                            # Wait for permissions to propagate
                            log("INFO: Waiting 30 seconds for permissions to propagate...")
                            import time
                            time.sleep(30)
                        else:
                            log(f"WARNING: Failed to update permissions: {response.status_code}")
                            if response.text:
                                try:
                                    error_data = response.json()
                                    log(f"ERROR: {json.dumps(error_data, indent=2)}")
                                except:
                                    log(f"ERROR: {response.text[:500]}")
                    else:
                        log("INFO: All permissions already configured")
                else:
                    log(f"WARNING: Failed to get IAM policy: {response.status_code}")
            except Exception as e:
                log(f"WARNING: Error setting up permissions: {str(e)[:100]}")
        else:
            log("WARNING: Could not determine project number, skipping service agent permissions")
        
        with tempfile.TemporaryDirectory() as temp_dir:
            # Step 3: Prepare Terraform
            log("STATUS: PREPARING_TERRAFORM")
            log("ACTION: Setting up Terraform configuration...")
            
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
  value = module.anava.firebase_config_secret_name
  sensitive = true
}}

output "api_key_secret" {{
  value = module.anava.firebase_api_key_secret_name
  sensitive = true
}}

output "workload_identity_provider" {{
  value = module.anava.workload_identity_provider
}}
"""
            
            with open(os.path.join(temp_dir, 'main.tf'), 'w') as f:
                f.write(tf_config)
            
            # Set up credentials with refresh
            creds_file = os.path.join(temp_dir, 'creds.json')
            cred_data = job_data['credentials']
            
            # Ensure we have a refresh token
            if not cred_data.get('refresh_token'):
                raise Exception("No refresh token available. Please re-authenticate.")
            
            credentials = google.oauth2.credentials.Credentials(**cred_data)
            
            # Always refresh to ensure valid token
            try:
                auth_request = google.auth.transport.requests.Request()
                credentials.refresh(auth_request)
                log("SUCCESS: Refreshed OAuth token")
            except Exception as e:
                log(f"WARNING: Token refresh failed: {e}")
            
            with open(creds_file, 'w') as f:
                f.write(json.dumps({
                    'type': 'authorized_user',
                    'client_id': credentials.client_id,
                    'client_secret': credentials.client_secret,
                    'refresh_token': credentials.refresh_token
                }))
            
            env = os.environ.copy()
            env['GOOGLE_APPLICATION_CREDENTIALS'] = creds_file
            
            # Create terraform plugin cache directory if it doesn't exist
            plugin_cache_dir = '/tmp/terraform-plugins'
            os.makedirs(plugin_cache_dir, exist_ok=True)
            env['TF_PLUGIN_CACHE_DIR'] = plugin_cache_dir
            
            # Step 4: Initialize Terraform
            log("STATUS: TERRAFORM_INIT")
            log("ACTION: Initializing Terraform (this takes 1-2 minutes)...")
            print(f"[{deployment_id}] Running terraform init in {temp_dir}")
            result = subprocess.run(
                ['terraform', 'init'],
                cwd=temp_dir,
                capture_output=True,
                text=True,
                env=env,
                timeout=300  # 5 minute timeout
            )
            
            if result.returncode != 0:
                print(f"[{deployment_id}] Terraform init FAILED:")
                print(f"[{deployment_id}] STDOUT: {result.stdout}")
                print(f"[{deployment_id}] STDERR: {result.stderr}")
                raise Exception(f"Terraform init failed: {result.stderr}")
            
            log("SUCCESS: Terraform initialized")
            
            # Import existing resources first
            log("STATUS: IMPORTING_EXISTING")
            log("ACTION: Checking for existing resources...")
            
            # Copy import script
            import shutil
            import_script = os.path.join(os.path.dirname(__file__), 'terraform_import_existing.sh')
            if os.path.exists(import_script):
                shutil.copy(import_script, temp_dir)
                os.chmod(os.path.join(temp_dir, 'terraform_import_existing.sh'), 0o755)
                
                # Run import
                import_result = subprocess.run(
                    ['./terraform_import_existing.sh', project_id, prefix, '.'],
                    cwd=temp_dir,
                    capture_output=True,
                    text=True,
                    env=env
                )
                
                if import_result.returncode == 0:
                    log("SUCCESS: Imported existing resources")
                else:
                    log("INFO: Import completed with warnings (this is normal)")
            
            # Step 5: Plan deployment
            log("STATUS: TERRAFORM_PLAN")
            log("ACTION: Planning infrastructure changes...")
            result = subprocess.run(
                ['terraform', 'plan', '-out=tfplan'],
                cwd=temp_dir,
                capture_output=True,
                text=True,
                env=env
            )
            
            if result.returncode != 0:
                # Try refresh and plan again
                log("INFO: Refreshing state and retrying plan...")
                refresh_result = subprocess.run(
                    ['terraform', 'refresh'],
                    cwd=temp_dir,
                    capture_output=True,
                    text=True,
                    env=env
                )
                
                # Retry plan
                result = subprocess.run(
                    ['terraform', 'plan', '-out=tfplan'],
                    cwd=temp_dir,
                    capture_output=True,
                    text=True,
                    env=env
                )
                
                if result.returncode != 0:
                    raise Exception(f"Terraform plan failed: {result.stderr}")
            
            # Step 6: Apply deployment
            log("STATUS: CREATING_RESOURCES")
            log("INFO: This will create approximately 45 Google Cloud resources")
            log("INFO: Resources include: Service Accounts, Secrets, Storage Buckets, Firestore, Cloud Functions, API Gateway")
            
            import time
            import threading
            
            process = subprocess.Popen(
                ['terraform', 'apply', '-auto-approve', 'tfplan'],
                cwd=temp_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                env=env
            )
            
            output_lines = []
            resources_created = 0
            total_resources = 45
            apply_timeout = 2400  # 40 minutes
            start_time = time.time()
            
            current_step = None
            
            for line in process.stdout:
                line = line.strip()
                if line and not line.startswith('Refreshing state'):
                    # Count resources being created
                    if 'Creation complete' in line or 'Created' in line:
                        resources_created += 1
                        resource_name = 'unknown'
                        
                        # Extract resource name
                        if 'resource' in line:
                            parts = line.split('"')
                            if len(parts) >= 2:
                                resource_name = parts[1]
                        elif '.' in line:
                            resource_name = line.split('.')[-1].split(':')[0]
                        
                        log(f"PROGRESS: Created resource {resources_created}/{total_resources}: {resource_name}")
                        
                        # Update step based on resource type
                        if 'service_account' in resource_name.lower():
                            if current_step != 'SERVICE_ACCOUNTS':
                                current_step = 'SERVICE_ACCOUNTS'
                                log("STATUS: CREATING_SERVICE_ACCOUNTS")
                        elif 'secret' in resource_name.lower():
                            if current_step != 'SECRETS':
                                current_step = 'SECRETS'
                                log("STATUS: CREATING_SECRETS")
                        elif 'storage' in resource_name.lower() or 'bucket' in resource_name.lower():
                            if current_step != 'STORAGE':
                                current_step = 'STORAGE'
                                log("STATUS: CREATING_STORAGE")
                        elif 'firestore' in resource_name.lower():
                            if current_step != 'FIRESTORE':
                                current_step = 'FIRESTORE'
                                log("STATUS: CREATING_FIRESTORE")
                        elif 'function' in resource_name.lower():
                            if current_step != 'FUNCTIONS':
                                current_step = 'FUNCTIONS'
                                log("STATUS: CREATING_CLOUD_FUNCTIONS")
                                log("INFO: Cloud Functions take 3-5 minutes to deploy")
                        elif 'apigateway' in resource_name.lower() or 'api_gateway' in resource_name.lower():
                            if current_step != 'API_GATEWAY':
                                current_step = 'API_GATEWAY'
                                log("STATUS: CREATING_API_GATEWAY")
                        elif 'workload' in resource_name.lower():
                            if current_step != 'WORKLOAD_IDENTITY':
                                current_step = 'WORKLOAD_IDENTITY'
                                log("STATUS: CREATING_WORKLOAD_IDENTITY")
                                
                    elif 'Creating...' in line:
                        resource_name = line.split('.')[-1].split(':')[0] if '.' in line else 'resource'
                        log(f"INFO: Creating {resource_name}...")
                    elif 'Error:' in line:
                        log(f"ERROR: {line}")
                    elif 'Still creating' in line:
                        # Extract wait time
                        if '[' in line and 's elapsed]' in line:
                            elapsed = line.split('[')[1].split('s elapsed]')[0]
                            resource = line.split('...')[0].strip()
                            log(f"WAITING: {resource} ({elapsed}s elapsed)")
                    
                    output_lines.append(line)
                
                # Check timeout
                if time.time() - start_time > apply_timeout:
                    log(f"ERROR: Terraform apply exceeded {apply_timeout/60} minute timeout")
                    process.terminate()
                    break
            
            process.wait()
            
            if process.returncode != 0:
                raise Exception("Terraform apply failed")
            
            # Step 7: Get outputs
            log("STATUS: RETRIEVING_OUTPUTS")
            log("ACTION: Getting deployment results...")
            result = subprocess.run(
                ['terraform', 'output', '-json'],
                cwd=temp_dir,
                capture_output=True,
                text=True,
                env=env
            )
            
            if result.returncode != 0:
                raise Exception("Failed to get outputs")
            
            outputs = json.loads(result.stdout)
            
            output_data = {
                'apiGatewayUrl': outputs['api_gateway_url']['value'],
                'firebaseConfigSecret': outputs['firebase_config']['value'],
                'apiKeySecret': outputs['api_key_secret']['value'],
                'workloadIdentityProvider': outputs['workload_identity_provider']['value']
            }
            
            if REDIS_AVAILABLE and redis_client:
                try:
                    redis_client.setex(
                        f'deployment_outputs:{deployment_id}',
                        86400,
                        json.dumps(output_data)
                    )
                except:
                    pass
            
            deployment_ref.update({
                'status': 'completed',
                'completedAt': datetime.utcnow(),
                'outputs': output_data
            })
            
            log("STATUS: DEPLOYMENT_COMPLETE")
            log("SUCCESS: All resources created successfully!")
            log(f"RESULT: API Gateway URL: {output_data['apiGatewayUrl']}")
            log(f"RESULT: Firebase Config Secret: {output_data['firebaseConfigSecret']}")
            log(f"RESULT: API Key Secret: {output_data['apiKeySecret']}")
    
    except Exception as e:
        log(f"ERROR: Deployment failed: {str(e)}")
        deployment_ref.update({
            'status': 'failed',
            'error': str(e),
            'failedAt': datetime.utcnow()
        })

@app.route('/api/deploy', methods=['POST'])
def start_deployment():
    if 'credentials' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    project_id = data.get('projectId')
    region = data.get('region', 'us-central1')
    prefix = data.get('prefix', 'anava')
    storage_location = data.get('storage_location', 'US')
    
    if not project_id:
        return jsonify({'error': 'Project ID required'}), 400
    
    # Validate prefix
    if not prefix or not prefix.replace('-', '').isalnum() or not prefix.islower():
        return jsonify({'error': 'Prefix must be lowercase alphanumeric with optional hyphens'}), 400
    
    deployment_id = str(uuid.uuid4())
    
    # Store deployment record
    deployment_ref = db.collection('deployments').document(deployment_id)
    deployment_ref.set({
        'id': deployment_id,
        'projectId': project_id,
        'region': region,
        'prefix': prefix,
        'storage_location': storage_location,
        'user': session['user_info']['email'],
        'status': 'queued',
        'createdAt': datetime.utcnow(),
        'updatedAt': datetime.utcnow()
    })
    
    # Queue deployment job
    job_data = {
        'deploymentId': deployment_id,
        'projectId': project_id,
        'region': region,
        'prefix': prefix,
        'storage_location': storage_location,
        'credentials': session['credentials']
    }
    
    if REDIS_AVAILABLE and redis_client:
        print(f"Queueing deployment {deployment_id} for project {project_id}")
        redis_client.lpush('deployment_queue', json.dumps(job_data))
        print(f"Job queued, queue length: {redis_client.llen('deployment_queue')}")
        
        return jsonify({
            'deploymentId': deployment_id,
            'status': 'queued',
            'message': 'Deployment queued successfully'
        })
    else:
        # Process deployment synchronously without Redis
        print(f"Processing deployment {deployment_id} synchronously (Redis unavailable)")
        import threading
        
        def process_async():
            run_single_deployment(job_data)
        
        thread = threading.Thread(target=process_async)
        thread.start()
        
        return jsonify({
            'deploymentId': deployment_id,
            'status': 'running',
            'message': 'Deployment started (Redis unavailable, processing directly)'
        })

@app.route('/api/deployment/<deployment_id>')
def get_deployment_status(deployment_id):
    if 'user_info' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    deployment_ref = db.collection('deployments').document(deployment_id)
    deployment = deployment_ref.get()
    
    if not deployment.exists:
        return jsonify({'error': 'Deployment not found'}), 404
    
    deployment_data = deployment.to_dict()
    
    if deployment_data['user'] != session['user_info']['email']:
        return jsonify({'error': 'Unauthorized'}), 403
    
    if REDIS_AVAILABLE and redis_client:
        try:
            logs = redis_client.lrange(f'deployment_logs:{deployment_id}', 0, -1)
            deployment_data['logs'] = logs
            
            # Get step information
            steps = redis_client.hgetall(f'deployment_steps:{deployment_id}')
            if steps:
                deployment_data['steps'] = {k: json.loads(v) for k, v in steps.items()}
            
            if deployment_data['status'] == 'completed':
                outputs = redis_client.get(f'deployment_outputs:{deployment_id}')
                if outputs:
                    deployment_data['outputs'] = json.loads(outputs)
        except:
            deployment_data['logs'] = ['Redis unavailable - check Cloud Run logs']
    else:
        deployment_data['logs'] = ['Redis unavailable - check Cloud Run logs']
    
    return jsonify(deployment_data)

@app.route('/api/deployment/<deployment_id>/progress')
def get_deployment_progress(deployment_id):
    """Get real-time deployment progress"""
    if 'user_info' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    # Get basic deployment info
    deployment_ref = db.collection('deployments').document(deployment_id)
    deployment = deployment_ref.get()
    
    if not deployment.exists:
        return jsonify({'error': 'Deployment not found'}), 404
    
    deployment_data = deployment.to_dict()
    
    # Check authorization
    if deployment_data['user'] != session['user_info']['email']:
        return jsonify({'error': 'Unauthorized'}), 403
    
    # Get progress from Redis
    progress = {
        'status': deployment_data.get('status', 'unknown'),
        'current_step': None,
        'steps': {},
        'overall_progress': 0
    }
    
    if REDIS_AVAILABLE and redis_client:
        try:
            # Get current step
            current_step = redis_client.get(f'deployment_current_step:{deployment_id}')
            if current_step:
                progress['current_step'] = current_step.decode('utf-8')
            
            # Get step statuses
            step_data = redis_client.hgetall(f'deployment_step_status:{deployment_id}')
            for step_id, status in step_data.items():
                progress['steps'][step_id.decode('utf-8')] = json.loads(status.decode('utf-8'))
            
            # Calculate overall progress
            total_steps = 9  # Total deployment steps
            completed_steps = sum(1 for s in progress['steps'].values() if s.get('status') == 'completed')
            progress['overall_progress'] = int((completed_steps / total_steps) * 100)
            
        except Exception as e:
            print(f"Error getting progress: {e}")
    
    return jsonify(progress)

@app.route('/api/worker/process', methods=['POST'])
def process_worker():
    """Manually process one job from the queue"""
    try:
        # Check queue
        job_json = redis_client.brpop('deployment_queue', timeout=1)
        if not job_json:
            return jsonify({'status': 'no_jobs', 'message': 'No jobs in queue'})
        
        # Process the job
        import threading
        job_data = json.loads(job_json[1])
        
        def process_job():
            deployment_id = job_data['deploymentId']
            print(f"Processing deployment {deployment_id}")
            # Run the deployment logic
            run_single_deployment(job_data)
        
        thread = threading.Thread(target=process_job)
        thread.start()
        
        return jsonify({
            'status': 'processing',
            'deployment_id': job_data['deploymentId']
        })
    except Exception as e:
        return jsonify({'status': 'error', 'message': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)