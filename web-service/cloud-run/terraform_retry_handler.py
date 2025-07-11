#!/usr/bin/env python3
"""
Terraform retry handler for partial deployments
"""

import re
import time
import subprocess
from typing import List, Dict, Tuple

class TerraformRetryHandler:
    """Handle Terraform errors with retry logic and manual intervention tracking"""
    
    # Errors that can be retried
    RETRYABLE_ERRORS = [
        "Error waiting for Creating",
        "googleapi: Error 503",
        "googleapi: Error 429",
        "timeout while waiting",
        "connection reset by peer"
        # REMOVED "already exists" - these should be IGNORED not retried!
    ]
    
    # Errors that should be ignored and treated as success
    IGNORABLE_ERRORS = [
        "Release already exists",  # Firebase rules release already exists
        "already exists and cannot be imported",  # Other resources that exist
        "AlreadyExists",  # Generic already exists error
        "already exists",  # ANY already exists error
        "Error 409",  # Google API conflict - resource exists
        "Requested entity already exists",  # Workload identity pool
        "already own it",  # Storage buckets
    ]
    
    # Errors that need manual intervention
    MANUAL_INTERVENTION_ERRORS = {
        "You must verify site or domain ownership": {
            "resource": "Firebase Web App",
            "action": "Domain verification required",
            "steps": [
                "1. Go to https://search.google.com/search-console",
                "2. Verify the domain shown in the error",
                "3. Re-run the deployment after verification"
            ],
            "can_continue": True
        },
        "Database already exists": {
            "resource": "Firestore Database", 
            "action": "Database name conflict",
            "steps": [
                "1. Either delete the existing database",
                "2. Or use a different prefix for your deployment"
            ],
            "can_continue": False
        },
        "Permission denied": {
            "resource": "Service Permissions",
            "action": "Grant required permissions",
            "steps": [
                "1. Ensure you have Owner or Editor role on the project",
                "2. Or manually grant the permissions shown in the error"
            ],
            "can_continue": False
        }
    }
    
    def __init__(self, log_func):
        self.log = log_func
        self.manual_interventions = []
        self.failed_resources = []
        self.successful_resources = []
        
    def parse_terraform_error(self, error_text: str) -> List[Dict]:
        """Parse terraform error output to identify specific issues"""
        errors = []
        
        # Extract individual error blocks
        error_blocks = re.findall(r'Error: ([^\n]+)\n([^\n]+\n)*', error_text)
        
        for block in error_blocks:
            error_msg = block[0]
            
            # Check if it's ignorable (treat as success)
            is_ignorable = any(pattern.lower() in error_msg.lower() for pattern in self.IGNORABLE_ERRORS)
            if is_ignorable:
                self.log(f"INFO: Ignoring error (resource already exists): {error_msg}")
                continue  # Skip this error entirely
            
            # Check if it's retryable
            is_retryable = any(pattern in error_msg for pattern in self.RETRYABLE_ERRORS)
            
            # Check if it needs manual intervention
            manual_fix = None
            for pattern, fix_info in self.MANUAL_INTERVENTION_ERRORS.items():
                if pattern in error_msg:
                    manual_fix = fix_info.copy()
                    manual_fix['error_msg'] = error_msg
                    break
            
            errors.append({
                'message': error_msg,
                'retryable': is_retryable,
                'manual_fix': manual_fix
            })
            
        return errors
    
    def should_retry(self, errors: List[Dict]) -> bool:
        """Determine if we should retry based on errors"""
        # Retry if any errors are retryable
        return any(e['retryable'] for e in errors)
    
    def can_continue(self, errors: List[Dict]) -> bool:
        """Determine if we can continue despite errors"""
        # Can continue if all manual intervention errors allow it
        for error in errors:
            if error['manual_fix'] and not error['manual_fix']['can_continue']:
                return False
        return True
    
    def apply_with_retry(self, temp_dir: str, env: dict, max_retries: int = 3) -> Tuple[bool, str]:
        """Apply terraform with retry logic"""
        
        for attempt in range(max_retries):
            self.log(f"STATUS: TERRAFORM_APPLY_ATTEMPT_{attempt + 1}")
            
            if attempt > 0:
                self.log(f"INFO: Retry attempt {attempt + 1} of {max_retries}")
                time.sleep(10 * attempt)  # Exponential backoff
                
                # Re-plan before retry to avoid stale plan
                self.log("INFO: Re-planning before retry...")
                plan_result = subprocess.run(
                    ['terraform', 'plan', '-out=tfplan', '-no-color'],
                    cwd=temp_dir,
                    capture_output=True,
                    text=True,
                    env=env
                )
                if plan_result.returncode != 0:
                    self.log(f"ERROR: Re-plan failed: {plan_result.stderr}")
                    return False, "Failed to re-plan for retry"
            
            # Run terraform apply with real-time output processing
            process = subprocess.Popen(
                ['terraform', 'apply', '-auto-approve', '-no-color', 'tfplan'],
                cwd=temp_dir,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                env=env
            )
            
            output_lines = []
            resources_created = 0
            current_step = None
            
            for line in process.stdout:
                line = line.strip()
                if line:
                    output_lines.append(line)
                    
                    # Track progress
                    if 'Creation complete' in line or 'Created' in line:
                        resources_created += 1
                        resource_name = 'unknown'
                        
                        # Better resource name extraction
                        # Example: "module.anava.google_service_account.device_auth: Creation complete"
                        if ': Creation complete' in line or ': Created' in line:
                            full_resource = line.split(':')[0].strip()
                            # Get the full resource path
                            resource_name = full_resource
                            # Also extract just the resource type and name
                            if 'module.anava.' in full_resource:
                                resource_name = full_resource.replace('module.anava.', '')
                        
                        self.log(f"PROGRESS: Created resource {resources_created}: {resource_name}")
                        self.successful_resources.append({
                            'number': resources_created,
                            'name': resource_name,
                            'full_path': line.split(':')[0].strip() if ':' in line else resource_name
                        })
                        
                    elif 'Creating...' in line:
                        resource_name = line.split('.')[-1].split(':')[0] if '.' in line else 'resource'
                        self.log(f"INFO: Creating {resource_name}...")
                        
                    elif 'Still creating' in line:
                        # Extract wait time
                        if '[' in line and 's elapsed]' in line:
                            elapsed = line.split('[')[1].split('s elapsed]')[0]
                            resource = line.split('...')[0].strip()
                            self.log(f"WAITING: {resource} ({elapsed}s elapsed)")
                    
                    elif 'Error:' in line:
                        # Check if it's an ignorable error
                        if any(pattern in line for pattern in self.IGNORABLE_ERRORS):
                            self.log(f"INFO: Ignoring error (already exists): {line}")
                        else:
                            self.log(f"ERROR: {line}")
            
            process.wait()
            output = '\n'.join(output_lines)
            
            if process.returncode == 0:
                self.log("SUCCESS: Terraform apply completed successfully")
                return True, output
            
            # Parse errors
            errors = self.parse_terraform_error(output)
            
            self.log(f"INFO: Found {len(errors)} errors after parsing (ignorable errors excluded)")
            
            # Log errors
            for error in errors:
                if error['manual_fix']:
                    self.manual_interventions.append(error['manual_fix'])
                    self.log(f"MANUAL_REQUIRED: {error['message']}")
                elif error['retryable']:
                    self.log(f"RETRYABLE_ERROR: {error['message']}")
                else:
                    self.log(f"ERROR: {error['message']}")
            
            # Check if we should retry
            if not self.should_retry(errors) or attempt == max_retries - 1:
                # If we have no errors (all were ignorable), consider it a success
                if len(errors) == 0:
                    self.log("INFO: All errors were ignorable, treating as success")
                    return True, output
                    
                # Can we continue with partial deployment?
                if self.can_continue(errors):
                    self.log("INFO: Continuing with partial deployment")
                    return False, output
                else:
                    self.log("ERROR: Cannot continue deployment due to blocking errors")
                    raise Exception("Deployment blocked by unrecoverable errors")
        
        return False, "Max retries reached"
    
    def get_deployment_summary(self) -> Dict:
        """Get summary of deployment including manual interventions needed"""
        return {
            'manual_interventions': self.manual_interventions,
            'successful_resources': self.successful_resources,
            'failed_resources': self.failed_resources
        }