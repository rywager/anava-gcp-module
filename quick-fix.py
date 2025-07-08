#!/usr/bin/env python3
"""
Quick fix to update the Cloud Run service with correct repository URL
"""

import subprocess
import tempfile
import os

# The correct Terraform configuration with the right repository
tf_config_template = '''
terraform {{
  required_version = ">= 1.5.0"
}}

module "anava" {{
  source = "git::https://github.com/rywager/anava-gcp-module.git?ref=master"
  
  project_id       = "{project_id}"
  region          = "{region}"
  solution_prefix = "{prefix}"
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
'''

print("🔧 The issue is that the deployed Cloud Run service is using the wrong GitHub repository URL.")
print("   Current (wrong): git::https://github.com/anava-ai/anava-gcp-module.git?ref=main")
print("   Correct:         git::https://github.com/rywager/anava-gcp-module.git?ref=master")
print()
print("The deployment service needs to be updated and redeployed with the correct URL.")
print("This requires recreating the main.py file with the fix and redeploying to Cloud Run.")
print()
print("Would you like me to:")
print("1. Recreate the web service source code with the correct repository URL")
print("2. Redeploy the Cloud Run service")
print("3. Test a deployment to make sure it works")
print()
print("This will take about 5-10 minutes to complete the redeployment.")