#!/usr/bin/env python3
"""
Immediate fix for the hung deployment system
This script addresses the root cause: Terraform init hanging due to network issues
"""

import os
import json
import redis
import subprocess
from google.cloud import firestore

# Configuration
REDIS_HOST = "10.150.87.59"
PROJECT_ID = "anava-ai"
DEPLOYMENT_ID = "85f769c3-e4a3-4e85-8779-f76046383499"

def fix_hung_deployment():
    """Mark the hung deployment as failed and clear the worker"""
    
    print("🔧 Fixing hung deployment system...")
    
    # Connect to Redis
    r = redis.Redis(host=REDIS_HOST, port=6379, decode_responses=True)
    
    # Connect to Firestore
    db = firestore.Client(project=PROJECT_ID)
    
    # 1. Check if deployment is still in queue (unlikely)
    queue_length = r.llen('deployment_queue')
    print(f"Current queue length: {queue_length}")
    
    # 2. Update deployment status in Firestore
    deployment_ref = db.collection('deployments').document(DEPLOYMENT_ID)
    deployment_ref.update({
        'status': 'failed',
        'error': 'Deployment timed out - Terraform init hung due to network issues',
        'completed_at': firestore.SERVER_TIMESTAMP
    })
    print(f"✓ Marked deployment {DEPLOYMENT_ID} as failed")
    
    # 3. Add final log entry
    log_key = f'deployment_logs:{DEPLOYMENT_ID}'
    r.rpush(log_key, json.dumps({
        'timestamp': '2025-07-08T16:20:00Z',
        'message': 'ERROR: Terraform init timed out. Cloud Run cannot access GitHub to download module.',
        'level': 'error'
    }))
    r.rpush(log_key, json.dumps({
        'timestamp': '2025-07-08T16:20:01Z',
        'message': 'Deployment failed. Please use embedded Terraform configuration instead.',
        'level': 'error'
    }))
    
    # 4. Clear any pending jobs
    while r.llen('deployment_queue') > 0:
        job = r.lpop('deployment_queue')
        print(f"Removed pending job from queue: {job}")
    
    print("✅ Deployment system is now unblocked")
    print("\nIMPORTANT: The worker process needs to be restarted to clear the hung thread.")
    print("Run: gcloud run services update anava-deploy --region=us-central1 --project=anava-ai")

def create_embedded_terraform_fix():
    """Create a fixed version that embeds Terraform configuration"""
    
    print("\n🔨 Creating fixed deployment handler...")
    
    # Read the existing main.tf
    with open('/Users/ryanwager/terraform-installer/main.tf', 'r') as f:
        terraform_config = f.read()
    
    # Create the fixed worker code
    fixed_worker = '''
def run_terraform_embedded(deployment_id, project_id, temp_dir):
    """Run Terraform with embedded configuration instead of GitHub module"""
    
    # Write the Terraform configuration directly
    with open(os.path.join(temp_dir, 'main.tf'), 'w') as f:
        f.write(EMBEDDED_TERRAFORM_CONFIG)
    
    # Initialize Terraform with timeout
    init_cmd = ['terraform', 'init', '-input=false']
    result = subprocess.run(
        init_cmd,
        cwd=temp_dir,
        capture_output=True,
        text=True,
        timeout=300  # 5 minute timeout
    )
    
    if result.returncode != 0:
        raise Exception(f"Terraform init failed: {result.stderr}")
    
    # Apply Terraform
    apply_cmd = [
        'terraform', 'apply',
        '-auto-approve',
        '-input=false',
        f'-var=project_id={project_id}'
    ]
    
    result = subprocess.run(
        apply_cmd,
        cwd=temp_dir,
        capture_output=True,
        text=True,
        timeout=1800  # 30 minute timeout
    )
    
    if result.returncode != 0:
        raise Exception(f"Terraform apply failed: {result.stderr}")
    
    return result.stdout
'''
    
    with open('/Users/ryanwager/terraform-installer/web-service/cloud-run/worker_fixed.py', 'w') as f:
        f.write(f"""#!/usr/bin/env python3
# Fixed worker that embeds Terraform configuration

EMBEDDED_TERRAFORM_CONFIG = '''{terraform_config}'''

{fixed_worker}
""")
    
    print("✅ Created fixed worker at: web-service/cloud-run/worker_fixed.py")

def provide_immediate_solution():
    """Provide immediate actionable steps"""
    
    print("\n📋 IMMEDIATE ACTIONS TO FIX THE SYSTEM:")
    print("\n1. RESTART THE SERVICE (clears hung worker):")
    print("   gcloud run services update anava-deploy --region=us-central1 --project=anava-ai")
    
    print("\n2. DEPLOY THE TIMEOUT FIX (already in revision 00035-cxj):")
    print("   gcloud run deploy anava-deploy --source=web-service/cloud-run --region=us-central1")
    
    print("\n3. SWITCH TO EMBEDDED TERRAFORM (permanent fix):")
    print("   - Update worker.py to use embedded Terraform config")
    print("   - This bypasses the GitHub access issue entirely")
    
    print("\n4. ALTERNATIVE: USE CLOUD BUILD")
    print("   - Cloud Build is better suited for long-running Terraform deployments")
    print("   - It has native git access and proper timeout handling")

if __name__ == "__main__":
    # Only run if we have proper credentials
    try:
        # fix_hung_deployment()  # Uncomment to actually fix
        create_embedded_terraform_fix()
        provide_immediate_solution()
    except Exception as e:
        print(f"Error: {e}")
        print("\nTo run this fix, ensure you have:")
        print("1. gcloud auth application-default login")
        print("2. Access to the Redis VM from your network")