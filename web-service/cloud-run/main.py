#!/usr/bin/env python3
"""
Anava Web Deployment Service - Fixed Repository URL
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

# Configuration
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT', 'anava-ai')
CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID')
CLIENT_SECRET = os.environ.get('GOOGLE_CLIENT_SECRET')
REDIRECT_URI = os.environ.get('REDIRECT_URI', 'http://localhost:5000/callback')

# Redis for job tracking - with fallback
try:
    redis_client = redis.StrictRedis(
        host=os.environ.get('REDIS_HOST', 'localhost'),
        port=int(os.environ.get('REDIS_PORT', 6379)),
        decode_responses=True,
        socket_connect_timeout=1,
        socket_timeout=1
    )
    # Test connection
    redis_client.ping()
    REDIS_AVAILABLE = True
except:
    # Fallback to None if Redis not available
    redis_client = None
    REDIS_AVAILABLE = False

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
    # Test Redis connection
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
        'oauth_configured': bool(CLIENT_ID and CLIENT_SECRET),
        'redirect_uri': REDIRECT_URI,
        'redis_status': redis_status,
        'redis_available': REDIS_AVAILABLE,
        'queue_length': queue_length,
        'timestamp': datetime.utcnow().isoformat()
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
        prompt='consent'  # FORCE Google to give us refresh token
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

def run_single_deployment(job_data):
    """Process a single deployment"""
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
            except:
                pass  # Fallback to just printing
        print(f"[{deployment_id}] {message}")
    
    try:
        log("🚀 Starting deployment...")
        log(f"📋 Project: {job_data['projectId']}")
        log(f"📋 Region: {job_data['region']}")
        log(f"📋 Prefix: {job_data['prefix']}")
        
        # Enable required APIs first
        log("🔧 Enabling required APIs...")
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
        
        for api in required_apis:
            try:
                enable_url = f'https://serviceusage.googleapis.com/v1/projects/{project_id}/services/{api}:enable'
                response = requests.post(enable_url, headers=headers, json={})
                if response.status_code in [200, 201]:
                    log(f"✅ Enabled {api}")
                elif response.status_code == 409:
                    log(f"ℹ️  {api} already enabled")
                else:
                    log(f"⚠️  Failed to enable {api}: {response.status_code}")
            except Exception as e:
                log(f"⚠️  Error enabling {api}: {str(e)[:100]}")
        
        # Grant Cloud Build permissions
        log("🔐 Setting up Cloud Build permissions...")
        try:
            # Get the Cloud Build service account
            build_sa = f"{project_id.split('-')[-1]}@cloudbuild.gserviceaccount.com"
            
            # Grant Cloud Functions Developer role
            iam_policy_url = f'https://cloudresourcemanager.googleapis.com/v1/projects/{project_id}:getIamPolicy'
            response = requests.post(iam_policy_url, headers=headers, json={})
            
            if response.status_code == 200:
                policy = response.json()
                
                # Add Cloud Functions Developer role
                role_binding = {
                    'role': 'roles/cloudfunctions.developer',
                    'members': [f'serviceAccount:{build_sa}']
                }
                
                # Check if binding exists
                binding_exists = False
                for binding in policy.get('bindings', []):
                    if binding['role'] == role_binding['role']:
                        if f'serviceAccount:{build_sa}' not in binding.get('members', []):
                            binding['members'].append(f'serviceAccount:{build_sa}')
                        binding_exists = True
                        break
                
                if not binding_exists:
                    policy['bindings'].append(role_binding)
                
                # Update IAM policy
                set_iam_url = f'https://cloudresourcemanager.googleapis.com/v1/projects/{project_id}:setIamPolicy'
                response = requests.post(set_iam_url, headers=headers, json={'policy': policy})
                
                if response.status_code == 200:
                    log(f"✅ Granted Cloud Functions Developer role to {build_sa}")
                else:
                    log(f"⚠️  Failed to grant permissions: {response.status_code}")
        except Exception as e:
            log(f"⚠️  Error setting up permissions: {str(e)[:100]}")
        
        with tempfile.TemporaryDirectory() as temp_dir:
            log("📝 Preparing Terraform configuration...")
            
            # FIXED: Use correct repository URL
            tf_config = f"""
terraform {{
  required_version = ">= 1.5.0"
}}

module "anava" {{
  source = "/terraform-cache/anava-gcp-module"
  
  project_id       = "{job_data['projectId']}"
  region          = "{job_data['region']}"
  solution_prefix = "{job_data['prefix']}"
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
                log("Refreshed OAuth token")
            except Exception as e:
                log(f"Warning: Token refresh failed: {e}")
            
            with open(creds_file, 'w') as f:
                f.write(json.dumps({
                    'type': 'authorized_user',
                    'client_id': credentials.client_id,
                    'client_secret': credentials.client_secret,
                    'refresh_token': credentials.refresh_token
                }))
            
            env = os.environ.copy()
            env['GOOGLE_APPLICATION_CREDENTIALS'] = creds_file
            
            # Initialize Terraform
            log("🔧 Initializing Terraform...")
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
            
            log("✅ Terraform initialized successfully")
            print(f"[{deployment_id}] Terraform init succeeded")
            
            # Plan deployment
            log("📋 Planning infrastructure changes...")
            result = subprocess.run(
                ['terraform', 'plan', '-out=tfplan'],
                cwd=temp_dir,
                capture_output=True,
                text=True,
                env=env
            )
            
            if result.returncode != 0:
                raise Exception(f"Terraform plan failed: {result.stderr}")
            
            # Apply deployment with retry logic for existing resources
            log("🚀 Deploying infrastructure (this may take 10-15 minutes)...")
            log("   Creating ~45 Google Cloud resources with lifecycle rules for existing resources")
            
            # First attempt
            apply_success = False
            for attempt in range(2):
                if attempt > 0:
                    log("Retrying deployment after handling existing resources...")
                    
                    # Re-run plan without the old state
                    result = subprocess.run(
                        ['terraform', 'plan', '-out=tfplan', '-refresh=false'],
                        cwd=temp_dir,
                        capture_output=True,
                        text=True,
                        env=env
                    )
                    
                    if result.returncode != 0:
                        log(f"Retry plan failed: {result.stderr}")
                        break
                
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
                total_resources = 45  # Approximate total
                apply_timeout = 2400  # 40 minutes timeout for terraform apply
                start_time = time.time()
                
                # Thread to monitor timeout
                def timeout_monitor():
                    time.sleep(apply_timeout)
                    if process.poll() is None:
                        log(f"❌ Terraform apply timeout after {apply_timeout/60} minutes, terminating...")
                        process.terminate()
                        time.sleep(5)
                        if process.poll() is None:
                            process.kill()
                
                timeout_thread = threading.Thread(target=timeout_monitor)
                timeout_thread.daemon = True
                timeout_thread.start()
                
                for line in process.stdout:
                    line = line.strip()
                    if line and not line.startswith('Refreshing state'):
                        # Count resources being created
                        if 'Creation complete' in line:
                            resources_created += 1
                            resource_name = line.split('.')[-1].split(':')[0] if '.' in line else 'resource'
                            log(f"✅ [{resources_created}/{total_resources}] Created: {resource_name}")
                        elif 'Creating...' in line:
                            resource_name = line.split('.')[-1].split(':')[0] if '.' in line else 'resource'
                            log(f"🔄 Creating: {resource_name}")
                        elif 'Error:' in line:
                            log(f"❌ {line}")
                        elif line.startswith('module.'):
                            # Skip raw terraform output, we're handling it above
                            pass
                        else:
                            log(line)
                        output_lines.append(line)
                    
                    # Check if we've exceeded timeout
                    if time.time() - start_time > apply_timeout:
                        log(f"❌ Terraform apply exceeded {apply_timeout/60} minute timeout")
                        process.terminate()
                        break
                
                process.wait()
                
                if process.returncode == 0:
                    apply_success = True
                    break
                else:
                    # Check if it failed due to existing resources
                    output_text = '\n'.join(output_lines)
                    if 'already exists' in output_text and attempt == 0:
                        log("Detected existing resources, will retry with fresh state...")
                        # Remove state file to force recreation
                        state_file = os.path.join(temp_dir, 'terraform.tfstate')
                        if os.path.exists(state_file):
                            os.remove(state_file)
                    else:
                        break
            
            if not apply_success:
                raise Exception("Terraform apply failed after retries")
            
            # Get outputs
            log("Retrieving deployment outputs...")
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
                    pass  # Fallback to just storing in Firestore
            
            deployment_ref.update({
                'status': 'completed',
                'completedAt': datetime.utcnow(),
                'outputs': output_data
            })
            
            log("🎉 Deployment completed successfully!")
    
    except Exception as e:
        log(f"❌ Deployment failed: {str(e)}")
        deployment_ref.update({
            'status': 'failed',
            'error': str(e),
            'failedAt': datetime.utcnow()
        })

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

@app.route('/api/deploy', methods=['POST'])
def start_deployment():
    if 'credentials' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.json
    project_id = data.get('projectId')
    region = data.get('region', 'us-central1')
    prefix = data.get('prefix', 'anava')
    
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

def run_deployment_worker():
    """Background worker with FIXED repository URL"""
    print("Worker started and waiting for jobs...")
    while True:
        try:
            print("Worker checking queue...")
            job_json = redis_client.brpop('deployment_queue', timeout=5)
            if not job_json:
                continue
            
            print(f"Worker got job: {job_json[0]}")
            
            job_data = json.loads(job_json[1])
            deployment_id = job_data['deploymentId']
            
            deployment_ref = db.collection('deployments').document(deployment_id)
            deployment_ref.update({
                'status': 'running',
                'startedAt': datetime.utcnow()
            })
            
            def log(message):
                timestamp = datetime.utcnow().strftime('%H:%M:%S')
                log_entry = f"{timestamp} - {message}"
                redis_client.lpush(f'deployment_logs:{deployment_id}', log_entry)
                redis_client.expire(f'deployment_logs:{deployment_id}', 86400)
            
            try:
                log("Starting deployment...")
                
                # Clean up existing resources if they exist
                log("Checking for existing resources...")
                project_id = job_data['projectId']
                prefix = job_data['prefix']
                
                # List of resources to clean up
                cleanup_commands = [
                    f"gcloud iam service-accounts delete {prefix}-device-auth-sa@{project_id}.iam.gserviceaccount.com --project={project_id} --quiet",
                    f"gcloud iam service-accounts delete {prefix}-tvm-sa@{project_id}.iam.gserviceaccount.com --project={project_id} --quiet",
                    f"gcloud iam service-accounts delete {prefix}-vertex-ai-sa@{project_id}.iam.gserviceaccount.com --project={project_id} --quiet",
                    f"gcloud iam service-accounts delete {prefix}-apigw-invoker-sa@{project_id}.iam.gserviceaccount.com --project={project_id} --quiet",
                    f"gcloud functions delete {prefix}-device-auth-fn --region=us-central1 --project={project_id} --quiet",
                    f"gcloud functions delete {prefix}-tvm-fn --region=us-central1 --project={project_id} --quiet",
                    f"gcloud api-gateway gateways delete {prefix}-gateway --location=us-central1 --project={project_id} --quiet",
                    f"gcloud api-gateway apis delete {prefix}-api --project={project_id} --quiet"
                ]
                
                log("Cleaning up existing resources for fresh deployment...")
                for cmd in cleanup_commands:
                    try:
                        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=60)
                        if result.returncode == 0:
                            log(f"✅ Cleaned up: {cmd.split()[2]}")
                        else:
                            if "not found" in result.stderr.lower() or "does not exist" in result.stderr.lower():
                                log(f"ℹ️  Resource not found: {cmd.split()[2]}")
                            else:
                                log(f"⚠️  Cleanup warning: {result.stderr}")
                    except Exception as e:
                        log(f"⚠️  Cleanup error: {str(e)}")
                
                log("✅ Cleanup completed, starting fresh deployment...")
                
                with tempfile.TemporaryDirectory() as temp_dir:
                    log("Preparing Terraform configuration...")
                    
                    # FIXED: Use correct repository URL
                    tf_config = f"""
terraform {{
  required_version = ">= 1.5.0"
}}

module "anava" {{
  source = "/terraform-cache/anava-gcp-module"
  
  project_id       = "{job_data['projectId']}"
  region          = "{job_data['region']}"
  solution_prefix = "{job_data['prefix']}"
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
                        log("Refreshed OAuth token")
                    except Exception as e:
                        log(f"Warning: Token refresh failed: {e}")
                    
                    with open(creds_file, 'w') as f:
                        f.write(json.dumps({
                            'type': 'authorized_user',
                            'client_id': credentials.client_id,
                            'client_secret': credentials.client_secret,
                            'refresh_token': credentials.refresh_token
                        }))
                    
                    env = os.environ.copy()
                    env['GOOGLE_APPLICATION_CREDENTIALS'] = creds_file
                    
                    # Initialize Terraform
                    log("Initializing Terraform...")
                    result = subprocess.run(
                        ['terraform', 'init'],
                        cwd=temp_dir,
                        capture_output=True,
                        text=True,
                        env=env
                    )
                    
                    if result.returncode != 0:
                        raise Exception(f"Terraform init failed: {result.stderr}")
                    
                    # Plan deployment
                    log("Planning infrastructure changes...")
                    result = subprocess.run(
                        ['terraform', 'plan', '-out=tfplan'],
                        cwd=temp_dir,
                        capture_output=True,
                        text=True,
                        env=env
                    )
                    
                    if result.returncode != 0:
                        raise Exception(f"Terraform plan failed: {result.stderr}")
                    
                    # Apply deployment
                    log("Deploying infrastructure (this may take 10-15 minutes)...")
                    
                    process = subprocess.Popen(
                        ['terraform', 'apply', '-auto-approve', 'tfplan'],
                        cwd=temp_dir,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                        env=env
                    )
                    
                    for line in process.stdout:
                        line = line.strip()
                        if line and not line.startswith('Refreshing state'):
                            log(line)
                    
                    process.wait()
                    
                    if process.returncode != 0:
                        raise Exception("Terraform apply failed")
                    
                    # Get outputs
                    log("Retrieving deployment outputs...")
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
                    
                    redis_client.setex(
                        f'deployment_outputs:{deployment_id}',
                        86400,
                        json.dumps(output_data)
                    )
                    
                    deployment_ref.update({
                        'status': 'completed',
                        'completedAt': datetime.utcnow(),
                        'outputs': output_data
                    })
                    
                    log("🎉 Deployment completed successfully!")
            
            except Exception as e:
                log(f"❌ Deployment failed: {str(e)}")
                deployment_ref.update({
                    'status': 'failed',
                    'error': str(e),
                    'failedAt': datetime.utcnow()
                })
        
        except Exception as e:
            print(f"Worker error: {e}")
            continue

# Note: Worker runs in separate process via supervisor

if __name__ == '__main__':
    app.run(debug=True, port=5000)