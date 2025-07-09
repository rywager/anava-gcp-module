#!/usr/bin/env python3
"""
Standalone worker process for handling deployments
"""

import os
import json
import subprocess
import tempfile
from datetime import datetime
import redis
import google.auth
import google.auth.transport.requests
import google.oauth2.credentials
from google.cloud import firestore

# Redis for job tracking
redis_client = redis.StrictRedis(
    host=os.environ.get('REDIS_HOST', 'localhost'),
    port=int(os.environ.get('REDIS_PORT', 6379)),
    decode_responses=True
)

# Firestore for deployment records
db = firestore.Client()

def log_deployment(deployment_id, message):
    """Log a deployment message"""
    timestamp = datetime.utcnow().strftime('%H:%M:%S')
    log_entry = f"{timestamp} - {message}"
    redis_client.lpush(f'deployment_logs:{deployment_id}', log_entry)
    redis_client.expire(f'deployment_logs:{deployment_id}', 86400)
    print(f"[{deployment_id}] {message}")

def run_deployment_worker():
    """Background worker process"""
    print("🚀 Deployment worker started and waiting for jobs...")
    
    while True:
        try:
            # Wait for job
            job_json = redis_client.brpop('deployment_queue', timeout=5)
            if not job_json:
                continue
            
            print(f"Got deployment job: {job_json[0]}")
            job_data = json.loads(job_json[1])
            deployment_id = job_data['deploymentId']
            
            # Update status
            deployment_ref = db.collection('deployments').document(deployment_id)
            deployment_ref.update({
                'status': 'running',
                'startedAt': datetime.utcnow()
            })
            
            log = lambda msg: log_deployment(deployment_id, msg)
            
            try:
                log("Starting deployment...")
                
                with tempfile.TemporaryDirectory() as temp_dir:
                    log("Preparing Terraform configuration...")
                    
                    # Create Terraform config
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
                    cred_data = job_data['credentials']
                    
                    if not cred_data.get('refresh_token'):
                        raise Exception("No refresh token available. Please re-authenticate.")
                    
                    credentials = google.oauth2.credentials.Credentials(**cred_data)
                    
                    # Refresh token
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
                    
                    log("✅ Terraform initialized")
                    
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
                    
                    log("✅ Plan created successfully")
                    
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
                    
                    # Stream output
                    resource_count = 0
                    for line in process.stdout:
                        line = line.strip()
                        if line and not line.startswith('Refreshing state'):
                            if 'Creating...' in line or 'Modifying...' in line:
                                resource_count += 1
                                log(f"[{resource_count}] {line}")
                            elif 'Creation complete' in line or 'Modifications complete' in line:
                                log(f"✅ {line}")
                            elif 'Error:' in line or 'failed' in line.lower():
                                log(f"❌ {line}")
                    
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

if __name__ == '__main__':
    run_deployment_worker()