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

# Redis for job tracking
redis_client = redis.StrictRedis(
    host=os.environ.get('REDIS_HOST', 'localhost'),
    port=int(os.environ.get('REDIS_PORT', 6379)),
    decode_responses=True
)

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
    return jsonify({
        'status': 'healthy',
        'service': 'anava-deploy',
        'oauth_configured': bool(CLIENT_ID and CLIENT_SECRET),
        'redirect_uri': REDIRECT_URI,
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
        include_granted_scopes='true'
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
    prefix = 'anava'
    
    if not project_id:
        return jsonify({'error': 'Project ID required'}), 400
    
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
    
    redis_client.lpush('deployment_queue', json.dumps(job_data))
    
    return jsonify({
        'deploymentId': deployment_id,
        'status': 'queued',
        'message': 'Deployment queued successfully'
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
    
    logs = redis_client.lrange(f'deployment_logs:{deployment_id}', 0, -1)
    deployment_data['logs'] = logs
    
    if deployment_data['status'] == 'completed':
        outputs = redis_client.get(f'deployment_outputs:{deployment_id}')
        if outputs:
            deployment_data['outputs'] = json.loads(outputs)
    
    return jsonify(deployment_data)

def run_deployment_worker():
    """Background worker with FIXED repository URL"""
    while True:
        try:
            job_json = redis_client.brpop('deployment_queue', timeout=5)
            if not job_json:
                continue
            
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
                
                with tempfile.TemporaryDirectory() as temp_dir:
                    log("Preparing Terraform configuration...")
                    
                    # FIXED: Use correct repository URL
                    tf_config = f"""
terraform {{
  required_version = ">= 1.5.0"
}}

module "anava" {{
  source = "git::https://github.com/rywager/anava-gcp-module.git?ref=master"
  
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
                    
                    # Set up credentials
                    creds_file = os.path.join(temp_dir, 'creds.json')
                    credentials = google.oauth2.credentials.Credentials(**job_data['credentials'])
                    
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

# Start worker thread
def start_worker():
    if not hasattr(app, '_worker_started'):
        app._worker_started = True
        import threading
        worker_thread = threading.Thread(target=run_deployment_worker, daemon=True)
        worker_thread.start()
        print("🚀 Deployment worker thread started with FIXED repository URL")
        return True
    return False

@app.before_request
def ensure_worker():
    if not hasattr(app, '_worker_started'):
        if start_worker():
            app.logger.info("Worker thread started with FIXED repository URL")

if __name__ == '__main__':
    app.run(debug=True, port=5000)