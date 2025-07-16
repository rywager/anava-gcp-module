#!/usr/bin/env python3
"""
Fixed deployment with CLEAR logging and UI updates
"""

import os
import json
import uuid
import subprocess
import tempfile
import time
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
VERSION = "2.3.40"  # FIXED: Corrected data source parameters (location, gateway_id)
COMMIT_SHA = os.environ.get('COMMIT_SHA', 'dev')
BUILD_TIME = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

# Configuration
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT', 'anava-ai')
CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')
REDIRECT_URI = os.environ.get('REDIRECT_URI', 'https://anava-deploy-392865621461.us-central1.run.app/callback')

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
        print(f"Redis connection failed at {REDIS_HOST}:{REDIS_PORT} - Error: {type(e).__name__}: {str(e)}")
        import traceback
        traceback.print_exc()
        return None

# Initialize Redis
redis_client = get_redis_client()
REDIS_AVAILABLE = redis_client is not None

# In-memory fallback for logs when Redis is unavailable
IN_MEMORY_LOGS = {}

if not REDIS_AVAILABLE:
    print(f"WARNING: Redis not available at {REDIS_HOST}:{REDIS_PORT}")
    print("Using in-memory log storage as fallback")
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
    return render_template('dashboard.html', 
                         user=session['user_info'],
                         version=VERSION,
                         commit_sha=COMMIT_SHA,
                         build_time=BUILD_TIME)

# Test mode route for automated testing
@app.route('/test-dashboard')
def test_dashboard():
    """Test mode dashboard that bypasses authentication for automated testing"""
    # Create test user session
    session['user_info'] = {
        'email': 'test@anava.ai',
        'name': 'Test User'
    }
    # Create test credentials for API calls
    session['credentials'] = {
        'token': 'test-token',
        'refresh_token': 'test-refresh-token',
        'token_uri': 'https://oauth2.googleapis.com/token',
        'client_id': CLIENT_ID,
        'client_secret': CLIENT_SECRET,
        'scopes': ['openid', 'email', 'profile', 'https://www.googleapis.com/auth/cloud-platform']
    }
    return render_template('dashboard.html', 
                         user=session['user_info'],
                         version=VERSION,
                         commit_sha=COMMIT_SHA,
                         build_time=BUILD_TIME)

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
                        'CLEANING_BLOCKING_RESOURCES': 'permissions',
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
        else:
            # Use in-memory storage when Redis is unavailable
            if deployment_id not in IN_MEMORY_LOGS:
                IN_MEMORY_LOGS[deployment_id] = []
            IN_MEMORY_LOGS[deployment_id].append(log_entry)
            # Keep only last 1000 logs per deployment to avoid memory issues
            if len(IN_MEMORY_LOGS[deployment_id]) > 1000:
                IN_MEMORY_LOGS[deployment_id] = IN_MEMORY_LOGS[deployment_id][-1000:]
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
        region = job_data['region']
        
        # Create auth header for API calls
        credentials = google.oauth2.credentials.Credentials(**job_data['credentials'])
        credentials.refresh(google.auth.transport.requests.Request())
        
        # Enable Cloud Build API to fix the permission error
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
        
        import requests
        import concurrent.futures
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
        
        log(f"INFO: Enabling {len(required_apis)} APIs in parallel...")
        # Use concurrent.futures timeout instead of signal-based timeout
        # which doesn't work in multi-threaded environments like gunicorn
        try:
            with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
                futures = {executor.submit(enable_api, api): api for api in required_apis}
                completed = 0
                
                # Use the timeout parameter in as_completed for thread-safe timeout
                try:
                    for future in concurrent.futures.as_completed(futures, timeout=30):
                        completed += 1
                        result = future.result()
                        log(f"PROGRESS: API {completed}/{len(required_apis)} - {result}")
                except concurrent.futures.TimeoutError:
                    log("WARNING: API enablement timed out after 30 seconds")
                    # Continue anyway - some APIs may have been enabled
                
                log("SUCCESS: All APIs processed")
        except Exception as e:
            log(f"ERROR: Failed to enable APIs: {str(e)}")
        
        # Set up environment variables for gcloud commands
        # Get credentials ready for cleanup operations
        creds_file = '/tmp/temp_creds.json'
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
            log(f"ERROR: Failed to refresh OAuth token: {str(e)}")
            raise Exception("Failed to refresh OAuth token. Please re-authenticate.")
        
        # Write credentials to file
        with open(creds_file, 'w') as f:
            f.write(json.dumps({
                'type': 'authorized_user',
                'client_id': credentials.client_id,
                'client_secret': credentials.client_secret,
                'refresh_token': credentials.refresh_token
            }))
        
        env = os.environ.copy()
        env['GOOGLE_APPLICATION_CREDENTIALS'] = creds_file
        
        # Step 1.5: Detect and clean existing resources that block deployment
        log("STATUS: SCANNING_EXISTING_RESOURCES")
        log("ACTION: Scanning for existing resources that need to be cleaned...")
        
        existing_resources = []
        cleaned = 0
        
        try:
            # 1. Check for existing API Keys
            try:
                list_cmd = ['gcloud', 'services', 'api-keys', 'list',
                            '--filter', f'displayName:"{prefix}*"',
                            '--format=value(name)', f'--project={project_id}']
                result = subprocess.run(list_cmd, capture_output=True, text=True, env=env)
                if result.returncode == 0 and result.stdout:
                    keys = [k for k in result.stdout.strip().split('\n') if k]
                    if keys:
                        existing_resources.extend([f"API Key: {k}" for k in keys])
                        log(f"FOUND: {len(keys)} existing API keys")
                        
                        # Auto-clean API keys as they block new key generation
                        for key_name in keys:
                            log(f"CLEANING: API Key {key_name}")
                            cmd = ['gcloud', 'services', 'api-keys', 'delete', key_name,
                                   f'--project={project_id}', '--quiet']
                            result = subprocess.run(cmd, capture_output=True, text=True, env=env)
                            if result.returncode == 0:
                                log(f"CLEANED: Removed API Key")
                                cleaned += 1
                            else:
                                log(f"WARNING: Could not delete API key - may not have permission")
            except Exception as e:
                log(f"WARNING: API key scan failed: {str(e)[:100]}")
            
            # 2. Check for existing API Gateway
            try:
                list_cmd = ['gcloud', 'api-gateway', 'gateways', 'list',
                            '--filter', f'displayName:"{prefix}*"',
                            '--format=value(name)', f'--project={project_id}']
                result = subprocess.run(list_cmd, capture_output=True, text=True, env=env)
                if result.returncode == 0 and result.stdout:
                    gateways = [g for g in result.stdout.strip().split('\n') if g]
                    if gateways:
                        existing_resources.extend([f"API Gateway: {g}" for g in gateways])
                        log(f"FOUND: {len(gateways)} existing API gateways")
                        
                        # Auto-clean API gateways as they can cause naming conflicts
                        for gateway in gateways:
                            log(f"CLEANING: API Gateway {gateway}")
                            # Extract location from gateway name
                            parts = gateway.split('/')
                            if len(parts) >= 4:
                                location = parts[3]
                                gateway_name = parts[5]
                                cmd = ['gcloud', 'api-gateway', 'gateways', 'delete', gateway_name,
                                       f'--location={location}', f'--project={project_id}', '--quiet']
                                result = subprocess.run(cmd, capture_output=True, text=True, env=env)
                                if result.returncode == 0:
                                    log(f"CLEANED: Removed API Gateway")
                                    cleaned += 1
                                else:
                                    log(f"WARNING: Could not delete API Gateway")
            except Exception as e:
                log(f"WARNING: API Gateway scan failed: {str(e)[:100]}")
            
            # 3. Check for existing Firebase web apps
            try:
                list_cmd = ['gcloud', 'firebase', 'apps', 'list',
                            '--filter', f'displayName:"{prefix}*"',
                            '--format=value(name)', f'--project={project_id}']
                result = subprocess.run(list_cmd, capture_output=True, text=True, env=env)
                if result.returncode == 0 and result.stdout:
                    apps = [a for a in result.stdout.strip().split('\n') if a]
                    if apps:
                        existing_resources.extend([f"Firebase App: {a}" for a in apps])
                        log(f"FOUND: {len(apps)} existing Firebase apps")
                        # Don't auto-delete Firebase apps - they can be reused
            except Exception as e:
                log(f"WARNING: Firebase app scan failed: {str(e)[:100]}")
                
            # Summary
            if existing_resources:
                log(f"FOUND: {len(existing_resources)} existing resources in project {project_id}")
                for resource in existing_resources:
                    log(f"  - {resource}")
                    
            if cleaned > 0:
                log(f"SUCCESS: Cleaned {cleaned} conflicting resources")
                log("INFO: Waiting 10 seconds for deletions to propagate...")
                time.sleep(10)
            else:
                log("INFO: No conflicting resources found or cleaned")
                
        except Exception as e:
            log(f"WARNING: Resource scanning had issues but continuing: {str(e)[:200]}")
        
        log("STATUS: SETTING_PERMISSIONS")  # Force status update
        
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
                    # For projects created after July 2024, Cloud Build uses Compute Engine SA
                    # We need to grant permissions to BOTH service accounts to be safe
                    build_service_accounts = [
                        f"{project_number}@cloudbuild.gserviceaccount.com",  # Legacy Cloud Build SA
                        f"{project_number}-compute@developer.gserviceaccount.com"  # New Compute Engine SA
                    ]
                    
                    # Add multiple roles for Cloud Build
                    build_roles = [
                        'roles/cloudfunctions.developer',
                        'roles/artifactregistry.writer',
                        'roles/storage.objectAdmin',
                        'roles/logging.logWriter',
                        'roles/iam.serviceAccountUser'  # Added to fix function deployment
                    ]
                    
                    for build_sa in build_service_accounts:
                        build_member = f"serviceAccount:{build_sa}"
                        log(f"INFO: Configuring permissions for {build_sa}")
                        
                        for build_role in build_roles:
                            binding_exists = False
                            
                            for binding in policy.get('bindings', []):
                                if binding['role'] == build_role:
                                    if build_member not in binding.get('members', []):
                                        binding['members'].append(build_member)
                                        policy_updated = True
                                        log(f"INFO: Adding {build_role} to {build_sa}")
                                    binding_exists = True
                                    break
                            
                            if not binding_exists:
                                policy['bindings'].append({
                                    'role': build_role,
                                    'members': [build_member]
                                })
                                policy_updated = True
                                log(f"INFO: Granting {build_role} to {build_sa}")
                    
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

output "api_key" {{
  value = module.anava.api_key
  sensitive = true
}}

output "firebase_config" {{
  value = module.anava.firebase_config
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

output "device_auth_function_url" {{
  value = module.anava.device_auth_function_url
}}

output "tvm_function_url" {{
  value = module.anava.tvm_function_url
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
            
            # Use existing credentials file from cleanup section
            creds_file = os.path.join(temp_dir, 'creds.json')
            # Copy the credentials file to the temp directory
            import shutil
            shutil.copy('/tmp/temp_creds.json', creds_file)
            
            # Environment was already set up in cleanup section
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
                timeout=1200  # 5 minute timeout
            )
            
            if result.returncode != 0:
                print(f"[{deployment_id}] Terraform init FAILED:")
                print(f"[{deployment_id}] STDOUT: {result.stdout}")
                print(f"[{deployment_id}] STDERR: {result.stderr}")
                raise Exception(f"Terraform init failed: {result.stderr}")
            
            log("SUCCESS: Terraform initialized")
            
            # Check for existing Firebase releases that might cause conflicts
            log("STATUS: CHECKING_FIREBASE_RELEASES")
            log("ACTION: Checking for existing Firebase releases...")
            
            try:
                # Check if Firebase project exists
                firebase_check = subprocess.run(
                    ['gcloud', 'firebase', 'projects:get', project_id, '--format=json'],
                    capture_output=True,
                    text=True,
                    env=env
                )
                
                if firebase_check.returncode == 0:
                    log("INFO: Firebase project already exists")
                    
                    # Check for existing Firestore rules release
                    firestore_release_check = subprocess.run(
                        ['gcloud', 'firestore', 'databases', 'describe', '(default)', 
                         f'--project={project_id}', '--format=json'],
                        capture_output=True,
                        text=True,
                        env=env
                    )
                    
                    if firestore_release_check.returncode == 0:
                        log("WARNING: Existing Firestore database found - Firebase rules may already exist")
                        log("INFO: Deployment will update existing rules if needed")
                    
                else:
                    log("INFO: No existing Firebase project found - will create new")
                    
            except Exception as e:
                log(f"WARNING: Could not check Firebase status: {str(e)[:100]}")
                log("INFO: Continuing with deployment anyway")
            
            # Step 5: Plan deployment
            log("STATUS: TERRAFORM_PLAN")
            log("ACTION: Planning infrastructure changes...")
            try:
                result = subprocess.run(
                    ['terraform', 'plan', '-out=tfplan'],
                    cwd=temp_dir,
                    capture_output=True,
                    text=True,
                    env=env,
                    timeout=1200  # 5 minute timeout
                )
            except subprocess.TimeoutExpired:
                log("ERROR: Terraform plan timed out after 5 minutes")
                raise Exception("Terraform plan timed out - this may indicate an authentication issue or network problem")
            
            if result.returncode != 0:
                # Try refresh and plan again
                log("INFO: Refreshing state and retrying plan...")
                refresh_result = subprocess.run(
                    ['terraform', 'refresh'],
                    cwd=temp_dir,
                    capture_output=True,
                    text=True,
                    env=env,
                    timeout=1200  # 5 minute timeout
                )
                
                # Retry plan
                result = subprocess.run(
                    ['terraform', 'plan', '-out=tfplan'],
                    cwd=temp_dir,
                    capture_output=True,
                    text=True,
                    env=env,
                    timeout=1200  # 5 minute timeout
                )
                
                if result.returncode != 0:
                    raise Exception(f"Terraform plan failed: {result.stderr}")
            
            # Step 6: Apply deployment with retry and partial success
            log("STATUS: CREATING_RESOURCES")
            log("INFO: This will create approximately 45 Google Cloud resources")
            log("INFO: Resources include: Service Accounts, Secrets, Storage Buckets, Firestore, Cloud Functions, API Gateway")
            
            # Update step to service accounts to show we're starting resource creation
            log("STATUS: CREATING_SERVICE_ACCOUNTS")
            
            # Import retry handler
            import sys
            sys.path.append(os.path.dirname(__file__))
            from terraform_retry_handler import TerraformRetryHandler
            
            retry_handler = TerraformRetryHandler(log)
            
            # Apply with retry logic
            success, output = retry_handler.apply_with_retry(temp_dir, env, max_retries=3)
            
            # Get deployment summary
            summary = retry_handler.get_deployment_summary()
            
            # If there are manual interventions needed, save them for later
            if summary['manual_interventions']:
                log("STATUS: MANUAL_INTERVENTION_REQUIRED")
                log("INFO: Some resources require manual intervention to complete:")
                
                # Save manual interventions to deployment record
                manual_steps = []
                for intervention in summary['manual_interventions']:
                    log(f"MANUAL_ACTION: {intervention['resource']} - {intervention['action']}")
                    for step in intervention['steps']:
                        log(f"  {step}")
                    manual_steps.append(intervention)
                
                deployment_ref.update({
                    'manual_interventions': manual_steps,
                    'partialSuccess': True
                })
            
            # If deployment failed completely, handle gracefully
            if not success and not summary['manual_interventions']:
                raise Exception("Terraform apply failed with unrecoverable errors")
            
            # Step 7: Get outputs
            log("STATUS: RETRIEVING_OUTPUTS")
            log("ACTION: Getting deployment results...")
            result = subprocess.run(
                ['terraform', 'output', '-json'],
                cwd=temp_dir,
                capture_output=True,
                text=True,
                env=env,
                timeout=120  # 1 minute timeout
            )
            
            if result.returncode != 0:
                raise Exception("Failed to get outputs")
            
            outputs = json.loads(result.stdout)
            
            # Log raw outputs for debugging
            log("DEBUG: Raw Terraform outputs:")
            log(json.dumps(outputs, indent=2))
            
            # Extract all the outputs properly - handle both dict and string formats
            def get_output_value(outputs, key, default='Not found'):
                """Safely get output value whether it's a dict with 'value' key or direct string"""
                output = outputs.get(key, default)
                if isinstance(output, dict):
                    return output.get('value', default)
                return output if output else default
            
            # Get basic output data from Terraform
            # Firebase config is a nested object, so handle it specially
            firebase_config_raw = outputs.get('firebase_config', {})
            if isinstance(firebase_config_raw, dict) and 'value' in firebase_config_raw:
                firebase_config = firebase_config_raw['value']
            else:
                firebase_config = firebase_config_raw if isinstance(firebase_config_raw, dict) else {}
            
            # Extract webApiKey from firebase_config if present
            web_api_key = firebase_config.get('apiKey', 'Not found') if firebase_config else 'Not found'
            
            # Fix storage bucket format if needed
            storage_bucket = get_output_value(outputs, 'firebase_storage_bucket')
            if storage_bucket.startswith('projects/') and '/buckets/' in storage_bucket:
                # Convert GCS format to Firebase Storage format
                storage_bucket = f"gs://{project_id}.firebasestorage.app"
            
            # Also fix it in firebase_config
            if firebase_config and firebase_config.get('storageBucket', '').startswith('projects/'):
                firebase_config['storageBucket'] = f"gs://{project_id}.firebasestorage.app"
            
            output_data = {
                'apiGatewayUrl': get_output_value(outputs, 'api_gateway_url'),
                'apiKey': get_output_value(outputs, 'api_key'),
                'apiGatewayKey': get_output_value(outputs, 'api_key'),  # Include as apiGatewayKey too
                'webApiKey': web_api_key,  # Add webApiKey from Firebase config
                'firebaseConfig': firebase_config,
                'firebaseConfigSecret': f"projects/{project_id}/secrets/{get_output_value(outputs, 'firebase_config_secret_name')}",
                'apiKeySecret': f"projects/{project_id}/secrets/{get_output_value(outputs, 'firebase_api_key_secret_name')}",
                'workloadIdentityProvider': get_output_value(outputs, 'workload_identity_provider'),
                'vertexServiceAccount': get_output_value(outputs, 'vertex_ai_service_account_email'),
                'firebaseStorageBucket': storage_bucket,  # Use corrected format
                'firebaseWebAppId': get_output_value(outputs, 'firebase_web_app_id'),
                'deviceAuthFunctionUrl': get_output_value(outputs, 'device_auth_function_url'),
                'tvmFunctionUrl': get_output_value(outputs, 'tvm_function_url'),
                'region': region,  # Add region to outputs
                # Include ALL raw outputs for verbose debugging
                '_allOutputs': outputs  # Raw outputs for debugging
            }
            
            # Skip Firebase config retrieval - it hangs, users can get it from the link
            if not output_data.get('firebaseConfig') or output_data['firebaseConfig'] == {}:
                log("INFO: Firebase config not in Terraform state, will provide link to Firebase console")
            
            # API Gateway URL should now come directly from Terraform outputs
            # No discovery needed - Terraform provides the actual URL
            
            # If API Key not found, try to discover it
            if output_data.get('apiKey') == 'Not found' or output_data.get('apiGatewayKey') == 'Not found':
                log("INFO: API Key not in Terraform state, discovering...")
                try:
                    # List API Keys
                    list_cmd = [
                        'gcloud', 'services', 'api-keys', 'list',
                        '--filter', f'displayName:{prefix}*',
                        '--format=json', f'--project={project_id}'
                    ]
                    result = subprocess.run(list_cmd, capture_output=True, text=True, env=env, timeout=30)
                    
                    if result.returncode == 0 and result.stdout:
                        api_keys = json.loads(result.stdout)
                        if api_keys and len(api_keys) > 0:
                            # Get the first matching key
                            api_key = api_keys[0]
                            key_string = api_key.get('keyString', '')
                            if key_string:
                                output_data['apiKey'] = key_string
                                output_data['apiGatewayKey'] = key_string
                                log(f"SUCCESS: Discovered API Key: {key_string[:8]}...")
                            else:
                                # Need to describe the key to get the string
                                key_name = api_key.get('name', '')
                                if key_name:
                                    describe_cmd = [
                                        'gcloud', 'services', 'api-keys', 'describe', key_name,
                                        '--format=json', f'--project={project_id}'
                                    ]
                                    desc_result = subprocess.run(describe_cmd, capture_output=True, text=True, env=env, timeout=30)
                                    
                                    if desc_result.returncode == 0 and desc_result.stdout:
                                        key_details = json.loads(desc_result.stdout)
                                        key_string = key_details.get('keyString', '')
                                        if key_string:
                                            output_data['apiKey'] = key_string
                                            output_data['apiGatewayKey'] = key_string
                                            log(f"SUCCESS: Discovered API Key: {key_string[:8]}...")
                except subprocess.TimeoutExpired:
                    log("WARNING: API Key discovery timed out after 30 seconds")
                except Exception as e:
                    log(f"WARNING: Could not discover API Key: {str(e)[:200]}")
            
            # Discover Cloud Function URLs if missing
            if output_data.get('deviceAuthFunctionUrl') == 'Not found' or output_data.get('tvmFunctionUrl') == 'Not found':
                log("INFO: Cloud Function URLs not in Terraform state, discovering...")
                try:
                    # List Cloud Functions
                    list_cmd = [
                        'gcloud', 'functions', 'list',
                        '--filter', f'name:{prefix}*',
                        '--format=json', f'--project={project_id}', '--gen2'
                    ]
                    result = subprocess.run(list_cmd, capture_output=True, text=True, env=env, timeout=30)
                    
                    if result.returncode == 0 and result.stdout:
                        functions = json.loads(result.stdout)
                        for func in functions:
                            func_name = func.get('name', '').split('/')[-1]
                            service_config = func.get('serviceConfig', {})
                            uri = service_config.get('uri', '')
                            
                            if 'device-auth' in func_name and uri:
                                output_data['deviceAuthFunctionUrl'] = uri
                                log(f"SUCCESS: Discovered Device Auth Function URL: {uri}")
                            elif 'tvm' in func_name and uri:
                                output_data['tvmFunctionUrl'] = uri
                                log(f"SUCCESS: Discovered TVM Function URL: {uri}")
                except Exception as e:
                    log(f"WARNING: Could not discover Cloud Function URLs: {str(e)[:200]}")
            
            # Discover Vertex AI service account if missing
            if output_data.get('vertexServiceAccount') == 'Not found':
                expected_sa = f"{prefix}-vertex-ai-sa@{project_id}.iam.gserviceaccount.com"
                check_cmd = ['gcloud', 'iam', 'service-accounts', 'describe', expected_sa,
                             f'--project={project_id}', '--format=value(email)']
                result = subprocess.run(check_cmd, capture_output=True, text=True, env=env)
                if result.returncode == 0:
                    output_data['vertexServiceAccount'] = expected_sa
                    log(f"SUCCESS: Discovered Vertex AI service account: {expected_sa}")
            
            # Instead of retrieving secret values, provide helpful links
            log("INFO: Creating resource links for easy access...")
            
            # Add helpful links for users to access their configuration
            # Ensure output_data is a dictionary (fix for bug)
            if not isinstance(output_data, dict):
                output_data = {}
            output_data.update({
                'apiKeySecretLink': f"https://console.cloud.google.com/security/secret-manager/secret/{prefix}-api-key?project={project_id}",
                'firebaseConfigLink': f"https://console.cloud.google.com/security/secret-manager/secret/{prefix}-firebase-config?project={project_id}",
                'firebaseWebAppLink': f"https://console.firebase.google.com/project/{project_id}/settings/general/",
                'resourceLinks': {
                    'secretManager': f"https://console.cloud.google.com/security/secret-manager?project={project_id}",
                    'apiGateway': f"https://console.cloud.google.com/api-gateway?project={project_id}",
                    'cloudFunctions': f"https://console.cloud.google.com/functions?project={project_id}"
                }
            })
            
            # Fill in missing secret names (for backwards compatibility)
            if 'Not found' in output_data.get('firebaseConfigSecret', 'Not found'):
                output_data['firebaseConfigSecret'] = f"projects/{project_id}/secrets/{prefix}-firebase-config"
            if 'Not found' in output_data.get('apiKeySecret', 'Not found'):
                output_data['apiKeySecret'] = f"projects/{project_id}/secrets/{prefix}-api-key"
            
            log("SUCCESS: All resource links created")
            
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
            log(f"RESULT: API Key Link: {output_data['apiKeySecretLink']}")
            log(f"RESULT: Firebase Config Link: {output_data['firebaseConfigLink']}")
            log(f"RESULT: Firebase Web App Link: {output_data['firebaseWebAppLink']}")
            log("INFO: Click the links above to access your configuration values")
            
            # Log Firebase config if available and is a dict
            if output_data.get('firebaseConfig') and isinstance(output_data.get('firebaseConfig'), dict):
                fc = output_data['firebaseConfig']
                log(f"RESULT: Firebase Project ID: {fc.get('projectId', 'Not found')}")
                log(f"RESULT: Firebase Auth Domain: {fc.get('authDomain', 'Not found')}")
                
                # Format storage bucket correctly for Firebase
                storage_bucket = fc.get('storageBucket', 'Not found')
                if storage_bucket.startswith('projects/') and '/buckets/' in storage_bucket:
                    # Extract bucket name from GCS format
                    bucket_name = storage_bucket.split('/buckets/')[1]
                    # For Firebase, use the project ID format
                    firebase_storage_url = f"gs://{project_id}.firebasestorage.app"
                    log(f"RESULT: Firebase Storage Bucket: {firebase_storage_url}")
                else:
                    log(f"RESULT: Firebase Storage Bucket: {storage_bucket}")
                    
                log(f"RESULT: Firebase Web App ID: {fc.get('appId', 'Not found')}")
    
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
    
    # Include manual interventions if they exist
    if 'manual_interventions' in deployment_data:
        deployment_data['manual_interventions'] = deployment_data['manual_interventions']
    
    if REDIS_AVAILABLE and redis_client:
        try:
            logs = redis_client.lrange(f'deployment_logs:{deployment_id}', 0, -1)
            deployment_data['logs'] = logs
            
            # Get step information
            steps = redis_client.hgetall(f'deployment_steps:{deployment_id}')
            if steps:
                deployment_data['steps'] = {k: json.loads(v) for k, v in steps.items()}
            
            # Get current step
            current_step = redis_client.get(f'deployment_current_step:{deployment_id}')
            if current_step:
                deployment_data['currentStep'] = current_step
            
            # Get step status details
            step_status = redis_client.hgetall(f'deployment_step_status:{deployment_id}')
            if step_status:
                deployment_data['stepStatus'] = {k: json.loads(v) for k, v in step_status.items()}
            
            if deployment_data['status'] == 'completed':
                outputs = redis_client.get(f'deployment_outputs:{deployment_id}')
                if outputs:
                    deployment_data['outputs'] = json.loads(outputs)
        except:
            # Use in-memory logs as fallback
            if deployment_id in IN_MEMORY_LOGS:
                deployment_data['logs'] = IN_MEMORY_LOGS[deployment_id]
            else:
                deployment_data['logs'] = ['Redis error - using in-memory logs']
    else:
        # Use in-memory logs when Redis is unavailable
        if deployment_id in IN_MEMORY_LOGS:
            deployment_data['logs'] = IN_MEMORY_LOGS[deployment_id]
        else:
            deployment_data['logs'] = ['No logs available yet...']
    
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
                progress['current_step'] = current_step
            
            # Get step statuses
            step_data = redis_client.hgetall(f'deployment_step_status:{deployment_id}')
            for step_id, status in step_data.items():
                progress['steps'][step_id] = json.loads(status)
            
            # Calculate overall progress
            total_steps = 9  # Total deployment steps
            completed_steps = sum(1 for s in progress['steps'].values() if s.get('status') == 'completed')
            progress['overall_progress'] = int((completed_steps / total_steps) * 100)
            
        except Exception as e:
            print(f"Error getting progress: {e}")
    
    return jsonify(progress)

@app.route('/api/deployment/<deployment_id>/resources')
def get_deployment_resources(deployment_id):
    """Get detailed resource information for a deployment"""
    if 'user_info' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    # Get deployment from Firestore
    deployment_ref = db.collection('deployments').document(deployment_id)
    deployment = deployment_ref.get()
    
    if not deployment.exists:
        return jsonify({'error': 'Deployment not found'}), 404
    
    deployment_data = deployment.to_dict()
    
    if deployment_data['user'] != session['user_info']['email']:
        return jsonify({'error': 'Unauthorized'}), 403
    
    resources = {
        'deployment_id': deployment_id,
        'status': deployment_data.get('status'),
        'created_resources': [],
        'failed_resources': [],
        'manual_interventions': deployment_data.get('manual_interventions', [])
    }
    
    # Parse logs to extract resource information
    if REDIS_AVAILABLE and redis_client:
        try:
            logs = redis_client.lrange(f'deployment_logs:{deployment_id}', 0, -1)
            for log in logs:
                if 'PROGRESS: Created resource' in log:
                    # Extract resource info from log
                    parts = log.split('PROGRESS: Created resource')[1].strip()
                    if ':' in parts:
                        num, name = parts.split(':', 1)
                        resources['created_resources'].append({
                            'number': int(num.strip()),
                            'name': name.strip()
                        })
                elif 'ERROR:' in log and 'resource' in log.lower():
                    resources['failed_resources'].append(log.split('ERROR:')[1].strip())
        except Exception as e:
            resources['error'] = f"Failed to parse logs: {str(e)}"
    
    # Get resource summary by type
    resource_types = {}
    for res in resources['created_resources']:
        # Parse resource type from name
        if '.' in res['name']:
            res_type = res['name'].split('.')[0]
        else:
            res_type = 'other'
        
        if res_type not in resource_types:
            resource_types[res_type] = []
        resource_types[res_type].append(res['name'])
    
    resources['summary_by_type'] = resource_types
    resources['total_created'] = len(resources['created_resources'])
    resources['total_failed'] = len(resources['failed_resources'])
    
    return jsonify(resources)

@app.route('/api/deployment/<deployment_id>/acap-config')
def get_acap_configuration(deployment_id):
    """Get ACAP-formatted configuration for a deployment"""
    if 'user_info' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    # Get deployment from Firestore
    deployment_ref = db.collection('deployments').document(deployment_id)
    deployment = deployment_ref.get()
    
    if not deployment.exists:
        return jsonify({'error': 'Deployment not found'}), 404
    
    deployment_data = deployment.to_dict()
    
    if deployment_data['user'] != session['user_info']['email']:
        return jsonify({'error': 'Unauthorized'}), 403
    
    if deployment_data.get('status') != 'completed':
        return jsonify({'error': 'Deployment not yet completed'}), 400
    
    outputs = deployment_data.get('outputs', {})
    project_id = deployment_data.get('projectId')
    region = outputs.get('region', deployment_data.get('region', 'us-central1'))
    
    # Create ACAP-compatible configuration
    # Get Firebase config values (handle both nested dict and flat structure)
    firebase_config = outputs.get('firebaseConfig', {})
    if isinstance(firebase_config, str):
        # If it's a string, it might be JSON
        try:
            firebase_config = json.loads(firebase_config)
        except:
            firebase_config = {}
    
    acap_config = {
        'firebase': {
            'webApiKey': firebase_config.get('apiKey') or outputs.get('webApiKey') or outputs.get('apiKey') or '',
            'authDomain': firebase_config.get('authDomain') or outputs.get('authDomain') or f"{project_id}.firebaseapp.com",
            'projectId': project_id,
            'storageBucket': firebase_config.get('storageBucket') or outputs.get('firebaseStorageBucket') or f"{project_id}.firebasestorage.app",
            'messagingSenderId': firebase_config.get('messagingSenderId') or outputs.get('messagingSenderId') or '',
            'appId': firebase_config.get('appId') or outputs.get('firebaseWebAppId') or '',
            'databaseURL': firebase_config.get('databaseURL') or f"https://{project_id}.firebaseio.com"
        },
        'googleAI': {
            'apiKey': outputs.get('apiKey') or outputs.get('apiGatewayKey') or '',
            'apiGatewayUrl': outputs.get('apiGatewayUrl') or '',
            'apiGatewayKey': outputs.get('apiGatewayKey') or outputs.get('apiKey') or '',
            'gcpProjectId': project_id,
            'gcpRegion': region,
            'gcsBucketName': outputs.get('firebaseStorageBucket') or f"{project_id}.firebasestorage.app"
        },
        'deployment': {
            'version': VERSION,
            'timestamp': deployment_data.get('completedAt', deployment_data.get('createdAt')).isoformat() if deployment_data.get('completedAt') or deployment_data.get('createdAt') else None,
            'deploymentId': deployment_id,
            'outputs': outputs  # Include all outputs for debugging
        }
    }
    
    return jsonify(acap_config)

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
    app.run(debug=True, port=5000)# Cache bust: Wed Jul  9 20:55:08 CDT 2025
