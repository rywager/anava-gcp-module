#!/usr/bin/env python3
"""
Fix for handling existing resources in Terraform deployments
Uses -replace flag instead of imports to handle existing resources
"""

import os
import json
import subprocess
import re

def create_improved_main():
    """Create improved main.py that handles existing resources better"""
    
    # Read current main.py
    with open('main.py', 'r') as f:
        content = f.read()
    
    # Find the terraform deployment section
    import_section_start = content.find('# Check for existing resources and import if needed')
    import_section_end = content.find('log("INFO: Import phase completed")')
    
    if import_section_start == -1 or import_section_end == -1:
        print("Could not find import section in main.py")
        return
    
    # Create new section that uses -replace instead of import
    new_section = '''# Check for existing resources and handle appropriately
            log("STATUS: CHECKING_EXISTING_RESOURCES")
            log("ACTION: Checking for existing resources...")
            
            # Get list of resources that might already exist
            existing_resources = []
            
            # Check service accounts
            service_accounts = [
                f"{prefix}-device-auth-sa@{project_id}.iam.gserviceaccount.com",
                f"{prefix}-tvm-sa@{project_id}.iam.gserviceaccount.com", 
                f"{prefix}-vertex-ai-sa@{project_id}.iam.gserviceaccount.com",
                f"{prefix}-apigw-invoker-sa@{project_id}.iam.gserviceaccount.com"
            ]
            
            for sa in service_accounts:
                check = subprocess.run(
                    ['gcloud', 'iam', 'service-accounts', 'describe', sa, 
                     f'--project={project_id}', '--format=json'],
                    capture_output=True,
                    text=True
                )
                if check.returncode == 0:
                    resource_name = sa.split('@')[0].replace(f'{prefix}-', '').replace('-sa', '').replace('-', '_')
                    existing_resources.append(f'module.anava.google_service_account.{resource_name}')
                    log(f"INFO: Found existing service account: {sa}")
            
            # Check storage buckets
            buckets = [
                f"{project_id}-{prefix}-function-source",
                f"{project_id}-{prefix}-firebase"
            ]
            
            for bucket in buckets:
                check = subprocess.run(
                    ['gsutil', 'ls', '-b', f'gs://{bucket}'],
                    capture_output=True,
                    text=True
                )
                if check.returncode == 0:
                    if 'function-source' in bucket:
                        existing_resources.append('module.anava.google_storage_bucket.function_source')
                    else:
                        existing_resources.append('module.anava.google_storage_bucket.firebase_bucket')
                    log(f"INFO: Found existing bucket: {bucket}")
            
            # Check secrets
            secrets = [
                f"{prefix}-firebase-config",
                f"{prefix}-api-key"
            ]
            
            for secret in secrets:
                check = subprocess.run(
                    ['gcloud', 'secrets', 'describe', secret, 
                     f'--project={project_id}', '--format=json'],
                    capture_output=True,
                    text=True
                )
                if check.returncode == 0:
                    resource_name = secret.replace(f'{prefix}-', '').replace('-', '_')
                    existing_resources.append(f'module.anava.google_secret_manager_secret.{resource_name}')
                    log(f"INFO: Found existing secret: {secret}")
            
            if existing_resources:
                log(f"INFO: Found {len(existing_resources)} existing resources")
                log("INFO: Will recreate these resources to ensure proper configuration")
            else:
                log("INFO: No existing resources found")
            '''
    
    # Replace the import section
    new_content = (
        content[:import_section_start] + 
        new_section + 
        '\n            ' +
        content[import_section_end + len('log("INFO: Import phase completed")'):] 
    )
    
    # Now update the terraform apply section to use -replace flags
    apply_section = '''# Step 6: Apply deployment with replace flags for existing resources
            log("STATUS: CREATING_RESOURCES")
            log("INFO: This will create approximately 45 Google Cloud resources")
            log("INFO: Resources include: Service Accounts, Secrets, Storage Buckets, Firestore, Cloud Functions, API Gateway")
            
            # Build terraform apply command with replace flags
            apply_cmd = ['terraform', 'apply', '-auto-approve']
            
            # Add replace flags for existing resources
            for resource in existing_resources:
                apply_cmd.extend(['-replace', resource])
                log(f"INFO: Will replace existing resource: {resource}")
            
            # Import retry handler
            import sys
            sys.path.append(os.path.dirname(__file__))
            from terraform_retry_handler import TerraformRetryHandler
            
            retry_handler = TerraformRetryHandler(log)
            
            # Apply with retry logic - use our custom command
            success, output = retry_handler.apply_with_retry(
                temp_dir, env, max_retries=3, 
                custom_apply_cmd=apply_cmd
            )'''
    
    # Find and replace the apply section
    apply_start = new_content.find('# Step 6: Apply deployment with retry and partial success')
    apply_end = new_content.find('success, output = retry_handler.apply_with_retry(temp_dir, env, max_retries=3)')
    
    if apply_start != -1 and apply_end != -1:
        # Find the end of the apply_with_retry line
        line_end = new_content.find('\n', apply_end)
        new_content = (
            new_content[:apply_start] + 
            apply_section +
            new_content[line_end:]
        )
    
    # Update version
    new_content = new_content.replace('VERSION = "2.3.7"', 'VERSION = "2.3.8"')
    
    # Write the updated main.py
    with open('main_v2.3.8.py', 'w') as f:
        f.write(new_content)
    
    print("✅ Created main_v2.3.8.py with improved existing resource handling")
    print("Key improvements:")
    print("- Checks for existing resources before deployment")
    print("- Uses -replace flag instead of import (no timeout issues)")
    print("- Faster deployment for projects with existing resources")
    print("- No hanging import scripts")

def update_retry_handler():
    """Update the retry handler to support custom apply commands"""
    
    retry_handler_path = 'terraform_retry_handler.py'
    
    with open(retry_handler_path, 'r') as f:
        content = f.read()
    
    # Find the apply_with_retry method
    method_start = content.find('def apply_with_retry(self, working_dir, env, max_retries=3):')
    
    if method_start == -1:
        print("Could not find apply_with_retry method")
        return
    
    # Replace method signature to accept custom command
    new_signature = 'def apply_with_retry(self, working_dir, env, max_retries=3, custom_apply_cmd=None):'
    content = content.replace(
        'def apply_with_retry(self, working_dir, env, max_retries=3):',
        new_signature
    )
    
    # Update the command construction
    old_cmd = "cmd = ['terraform', 'apply', '-auto-approve', '-json']"
    new_cmd = '''if custom_apply_cmd:
            # Use provided custom command and add -json flag
            cmd = custom_apply_cmd + ['-json']
        else:
            cmd = ['terraform', 'apply', '-auto-approve', '-json']'''
    
    content = content.replace(old_cmd, new_cmd)
    
    # Write updated retry handler
    with open('terraform_retry_handler_updated.py', 'w') as f:
        f.write(content)
    
    print("✅ Created terraform_retry_handler_updated.py with custom command support")

if __name__ == "__main__":
    create_improved_main()
    update_retry_handler()
    
    print("\n🎉 Fixes completed!")
    print("\nTo deploy the fixes:")
    print("1. Review main_v2.3.8.py")
    print("2. Copy it to main.py when ready")
    print("3. Copy terraform_retry_handler_updated.py to terraform_retry_handler.py")
    print("4. Deploy with: gcloud run deploy")