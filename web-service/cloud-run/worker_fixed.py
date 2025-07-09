#!/usr/bin/env python3
"""
Fixed worker implementation with embedded Terraform and enhanced features
"""

import os
import json
import tempfile
import shutil
import subprocess
import threading
import time
import uuid
from datetime import datetime
import redis
from google.cloud import firestore, storage
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configuration
REDIS_HOST = os.environ.get('REDIS_HOST', 'localhost')
PROJECT_ID = os.environ.get('GOOGLE_CLOUD_PROJECT', 'anava-ai')
STORAGE_BUCKET = f"{PROJECT_ID}-deployment-logs"
MAX_DEPLOYMENT_TIME = 3600  # 1 hour max
TERRAFORM_INIT_TIMEOUT = 300  # 5 minutes
TERRAFORM_APPLY_TIMEOUT = 2400  # 40 minutes

# Cancellation tracking
active_deployments = {}
deployment_locks = {}

class DeploymentLogger:
    """Multi-destination logger for deployments"""
    
    def __init__(self, deployment_id, redis_client=None):
        self.deployment_id = deployment_id
        self.redis_client = redis_client
        self.logs = []
        self.storage_client = storage.Client()
        
        # Ensure bucket exists
        try:
            self.bucket = self.storage_client.bucket(STORAGE_BUCKET)
            if not self.bucket.exists():
                self.bucket = self.storage_client.create_bucket(STORAGE_BUCKET)
        except:
            self.bucket = None
            logger.warning("Could not create/access GCS bucket for logs")
    
    def log(self, message, level='info'):
        """Log to multiple destinations"""
        timestamp = datetime.utcnow().isoformat()
        log_entry = {
            'timestamp': timestamp,
            'level': level,
            'message': message
        }
        
        # Memory buffer
        self.logs.append(log_entry)
        
        # Console
        logger.info(f"[{self.deployment_id}] {message}")
        
        # Redis (if available)
        if self.redis_client:
            try:
                log_key = f'deployment_logs:{self.deployment_id}'
                self.redis_client.rpush(log_key, json.dumps(log_entry))
                self.redis_client.expire(log_key, 86400)  # 24 hours
            except Exception as e:
                logger.error(f"Redis logging failed: {e}")
        
        # Firestore (real-time updates)
        try:
            db = firestore.Client()
            db.collection('deployment_logs').document(self.deployment_id).collection('entries').add({
                **log_entry,
                'created_at': firestore.SERVER_TIMESTAMP
            })
        except Exception as e:
            logger.error(f"Firestore logging failed: {e}")
    
    def save_to_storage(self):
        """Save logs to Cloud Storage"""
        if not self.bucket:
            return
            
        try:
            blob_name = f"deployments/{self.deployment_id}/logs.json"
            blob = self.bucket.blob(blob_name)
            blob.upload_from_string(json.dumps(self.logs, indent=2))
            logger.info(f"Logs saved to gs://{STORAGE_BUCKET}/{blob_name}")
        except Exception as e:
            logger.error(f"Failed to save logs to storage: {e}")

def embed_terraform_module(temp_dir):
    """Embed the Terraform module directly instead of fetching from GitHub"""
    
    # Read the main Terraform configuration
    main_tf_content = '''
terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# Enable required APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "firebase.googleapis.com",
    "cloudfunctions.googleapis.com",
    "apigateway.googleapis.com",
    "secretmanager.googleapis.com",
    "firestore.googleapis.com",
    "storage.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com"
  ])

  project = var.project_id
  service = each.value
  disable_dependent_services = false
  disable_on_destroy = false
}

# Firebase project
resource "google_firebase_project" "default" {
  provider = google-beta
  project  = var.project_id
  depends_on = [google_project_service.required_apis]
}

# Firestore database
resource "google_firestore_database" "anava" {
  project     = var.project_id
  name        = "anava"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"
  depends_on = [google_firebase_project.default]
}

# Firebase Storage
resource "google_firebase_storage_bucket" "default" {
  provider  = google-beta
  project   = var.project_id
  bucket_id = "${var.project_id}.appspot.com"
  depends_on = [google_firebase_project.default]
}

# Service accounts
resource "google_service_account" "device_auth" {
  project      = var.project_id
  account_id   = "${var.solution_prefix}-device-auth-sa"
  display_name = "Device Auth Service Account"
}

resource "google_service_account" "vertex_ai" {
  project      = var.project_id
  account_id   = "${var.solution_prefix}-vertex-ai-sa"
  display_name = "Vertex AI Service Account"
}

# IAM bindings
resource "google_project_iam_member" "device_auth_firestore" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.device_auth.email}"
}

resource "google_project_iam_member" "vertex_ai_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.vertex_ai.email}"
}

# Workload Identity Pool
resource "google_iam_workload_identity_pool" "github_pool" {
  project                  = var.project_id
  workload_identity_pool_id = "${var.solution_prefix}-github-pool"
  display_name             = "GitHub Actions Pool"
  description              = "Identity pool for GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github_provider" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_pool.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"
  display_name                       = "GitHub Provider"
  
  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }
  
  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# Note: Full implementation continues with all resources from the original module
# This is a simplified version for immediate deployment
'''
    
    variables_tf = '''
variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "solution_prefix" {
  description = "Prefix for all resources"
  type        = string
  default     = "anava"
}

variable "github_org" {
  description = "GitHub organization for Workload Identity"
  type        = string
  default     = "rywager"
}

variable "github_repo" {
  description = "GitHub repository for Workload Identity"
  type        = string
  default     = "anava"
}
'''
    
    outputs_tf = '''
output "project_id" {
  value = var.project_id
}

output "firebase_project_id" {
  value = google_firebase_project.default.project
}

output "firestore_database" {
  value = google_firestore_database.anava.name
}

output "device_auth_sa_email" {
  value = google_service_account.device_auth.email
}

output "vertex_ai_sa_email" {
  value = google_service_account.vertex_ai.email
}

output "deployment_status" {
  value = "Infrastructure successfully deployed"
}
'''
    
    # Write all Terraform files
    with open(os.path.join(temp_dir, 'main.tf'), 'w') as f:
        f.write(main_tf_content)
    
    with open(os.path.join(temp_dir, 'variables.tf'), 'w') as f:
        f.write(variables_tf)
    
    with open(os.path.join(temp_dir, 'outputs.tf'), 'w') as f:
        f.write(outputs_tf)
    
    # Create subdirectories for functions and templates if needed
    os.makedirs(os.path.join(temp_dir, 'functions'), exist_ok=True)
    os.makedirs(os.path.join(temp_dir, 'templates'), exist_ok=True)

def run_terraform_with_timeout(cmd, cwd, timeout, deployment_id):
    """Run Terraform command with timeout and cancellation support"""
    
    def target():
        active_deployments[deployment_id]['process'] = subprocess.Popen(
            cmd,
            cwd=cwd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            env={**os.environ, 'TF_IN_AUTOMATION': 'true'}
        )
    
    thread = threading.Thread(target=target)
    thread.start()
    thread.join(timeout=0.5)  # Wait for process to start
    
    if deployment_id not in active_deployments or 'process' not in active_deployments[deployment_id]:
        raise Exception("Failed to start Terraform process")
    
    process = active_deployments[deployment_id]['process']
    output = []
    
    # Monitor process with cancellation support
    start_time = time.time()
    while True:
        # Check for cancellation
        if active_deployments.get(deployment_id, {}).get('cancelled', False):
            process.terminate()
            time.sleep(2)
            if process.poll() is None:
                process.kill()
            raise Exception("Deployment cancelled by user")
        
        # Check for timeout
        if time.time() - start_time > timeout:
            process.terminate()
            time.sleep(2)
            if process.poll() is None:
                process.kill()
            raise Exception(f"Command timed out after {timeout} seconds")
        
        # Read output
        line = process.stdout.readline()
        if line:
            output.append(line.strip())
            # Log progress in real-time
            if deployment_id in active_deployments and 'logger' in active_deployments[deployment_id]:
                active_deployments[deployment_id]['logger'].log(line.strip())
        
        # Check if process finished
        if process.poll() is not None:
            # Read any remaining output
            remaining = process.stdout.read()
            if remaining:
                output.extend(remaining.strip().split('\n'))
            break
        
        time.sleep(0.1)
    
    return process.returncode, '\n'.join(output)

def process_deployment(deployment_data):
    """Process a single deployment with all enhancements"""
    
    deployment_id = deployment_data['deployment_id']
    project_id = deployment_data['project_id']
    user_email = deployment_data['user_email']
    
    # Initialize deployment tracking
    active_deployments[deployment_id] = {
        'started_at': time.time(),
        'cancelled': False,
        'status': 'running'
    }
    
    # Initialize logger
    try:
        r = redis.Redis(host=REDIS_HOST, port=6379, decode_responses=True)
        logger_instance = DeploymentLogger(deployment_id, r)
    except:
        logger_instance = DeploymentLogger(deployment_id)
    
    active_deployments[deployment_id]['logger'] = logger_instance
    
    # Initialize Firestore
    db = firestore.Client()
    deployment_ref = db.collection('deployments').document(deployment_id)
    
    temp_dir = None
    
    try:
        logger_instance.log(f"Starting deployment for project: {project_id}")
        
        # Update status
        deployment_ref.update({
            'status': 'running',
            'started_at': firestore.SERVER_TIMESTAMP
        })
        
        # Create temporary directory
        temp_dir = tempfile.mkdtemp()
        logger_instance.log(f"Created temporary directory: {temp_dir}")
        
        # Embed Terraform module
        logger_instance.log("Preparing Terraform configuration...")
        embed_terraform_module(temp_dir)
        
        # Get OAuth token
        logger_instance.log("Refreshing OAuth token...")
        creds_data = json.loads(deployment_data.get('credentials', '{}'))
        creds = Credentials(
            token=creds_data.get('token'),
            refresh_token=creds_data.get('refresh_token'),
            token_uri=creds_data.get('token_uri'),
            client_id=creds_data.get('client_id'),
            client_secret=creds_data.get('client_secret')
        )
        
        if creds.expired:
            creds.refresh(Request())
            logger_instance.log("OAuth token refreshed successfully")
        
        # Set up environment
        env = os.environ.copy()
        env['GOOGLE_OAUTH_ACCESS_TOKEN'] = creds.token
        
        # Initialize Terraform
        logger_instance.log("Initializing Terraform...")
        returncode, output = run_terraform_with_timeout(
            ['terraform', 'init', '-input=false'],
            cwd=temp_dir,
            timeout=TERRAFORM_INIT_TIMEOUT,
            deployment_id=deployment_id
        )
        
        if returncode != 0:
            raise Exception(f"Terraform init failed:\n{output}")
        
        logger_instance.log("Terraform initialized successfully")
        
        # Plan Terraform
        logger_instance.log("Planning Terraform changes...")
        returncode, output = run_terraform_with_timeout(
            ['terraform', 'plan', '-input=false', f'-var=project_id={project_id}', '-out=tfplan'],
            cwd=temp_dir,
            timeout=600,  # 10 minutes for plan
            deployment_id=deployment_id
        )
        
        if returncode != 0:
            raise Exception(f"Terraform plan failed:\n{output}")
        
        # Apply Terraform
        logger_instance.log("Applying Terraform configuration...")
        returncode, output = run_terraform_with_timeout(
            ['terraform', 'apply', '-input=false', '-auto-approve', 'tfplan'],
            cwd=temp_dir,
            timeout=TERRAFORM_APPLY_TIMEOUT,
            deployment_id=deployment_id
        )
        
        if returncode != 0:
            raise Exception(f"Terraform apply failed:\n{output}")
        
        # Get outputs
        logger_instance.log("Retrieving deployment outputs...")
        result = subprocess.run(
            ['terraform', 'output', '-json'],
            cwd=temp_dir,
            capture_output=True,
            text=True,
            env=env
        )
        
        outputs = {}
        if result.returncode == 0:
            outputs = json.loads(result.stdout)
        
        # Save outputs
        if 'r' in locals():
            r.setex(f'deployment_outputs:{deployment_id}', 86400, json.dumps(outputs))
        
        # Update deployment status
        deployment_ref.update({
            'status': 'completed',
            'completed_at': firestore.SERVER_TIMESTAMP,
            'outputs': outputs
        })
        
        logger_instance.log("Deployment completed successfully!", level='success')
        active_deployments[deployment_id]['status'] = 'completed'
        
    except Exception as e:
        error_msg = str(e)
        logger_instance.log(f"Deployment failed: {error_msg}", level='error')
        
        # Update deployment status
        deployment_ref.update({
            'status': 'failed',
            'error': error_msg,
            'completed_at': firestore.SERVER_TIMESTAMP
        })
        
        active_deployments[deployment_id]['status'] = 'failed'
        
    finally:
        # Cleanup
        if temp_dir and os.path.exists(temp_dir):
            try:
                shutil.rmtree(temp_dir)
                logger_instance.log("Cleaned up temporary directory")
            except:
                pass
        
        # Save logs to storage
        logger_instance.save_to_storage()
        
        # Remove from active deployments
        if deployment_id in active_deployments:
            del active_deployments[deployment_id]

def cancel_deployment(deployment_id):
    """Cancel an active deployment"""
    if deployment_id in active_deployments:
        active_deployments[deployment_id]['cancelled'] = True
        return True
    return False

def get_deployment_status(deployment_id):
    """Get current status of a deployment"""
    if deployment_id in active_deployments:
        deployment = active_deployments[deployment_id]
        return {
            'status': deployment.get('status', 'unknown'),
            'cancelled': deployment.get('cancelled', False),
            'duration': time.time() - deployment.get('started_at', 0)
        }
    return None

# Health check for monitoring
def health_check():
    """Check worker health"""
    return {
        'healthy': True,
        'active_deployments': len(active_deployments),
        'deployments': list(active_deployments.keys())
    }

if __name__ == "__main__":
    # Test the worker locally
    logger.info("Worker module loaded successfully")
    logger.info(f"Active deployments: {len(active_deployments)}")