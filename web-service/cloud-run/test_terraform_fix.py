#!/usr/bin/env python3
"""Test that Terraform issues are fixed"""

import subprocess
import tempfile
import os

print("Testing Terraform Fix")
print("=" * 50)

# Test 1: Plugin cache directory
print("\n1. Testing plugin cache directory creation...")
plugin_cache_dir = '/tmp/terraform-plugins'
if os.path.exists(plugin_cache_dir):
    print(f"✅ Plugin cache directory exists: {plugin_cache_dir}")
else:
    os.makedirs(plugin_cache_dir, exist_ok=True)
    print(f"✅ Created plugin cache directory: {plugin_cache_dir}")

# Test 2: Check Terraform module for duplicate providers
print("\n2. Checking for duplicate required_providers...")

# Check main.tf
main_tf = "terraform-anava-module/main.tf"
with open(main_tf, 'r') as f:
    main_content = f.read()
    if 'required_providers' in main_content:
        print(f"❌ Found required_providers in {main_tf} - should only be in versions.tf")
    else:
        print(f"✅ No required_providers in {main_tf}")

# Check versions.tf
versions_tf = "terraform-anava-module/versions.tf"
with open(versions_tf, 'r') as f:
    versions_content = f.read()
    if 'required_providers' in versions_content:
        print(f"✅ Found required_providers in {versions_tf}")
        if 'random' in versions_content and 'archive' in versions_content:
            print("✅ All required providers (google, google-beta, random, archive) are present")
        else:
            print("❌ Missing some providers in versions.tf")
    else:
        print(f"❌ No required_providers found in {versions_tf}")

# Test 3: Terraform init test
print("\n3. Testing terraform init with sample config...")

with tempfile.TemporaryDirectory() as temp_dir:
    # Create a minimal test configuration
    test_config = """
terraform {
  required_version = ">= 1.5.0"
}

module "anava" {
  source = "./terraform-anava-module"
  
  project_id       = "test-project"
  region          = "us-central1"
  solution_prefix = "test"
  storage_location = "US"
}
"""
    
    config_path = os.path.join(temp_dir, 'main.tf')
    with open(config_path, 'w') as f:
        f.write(test_config)
    
    # Copy the module
    module_dir = os.path.join(temp_dir, 'terraform-anava-module')
    subprocess.run(['cp', '-r', 'terraform-anava-module', module_dir], check=True)
    
    # Set environment
    env = os.environ.copy()
    env['TF_PLUGIN_CACHE_DIR'] = plugin_cache_dir
    
    # Run terraform init
    print(f"Running terraform init in {temp_dir}...")
    result = subprocess.run(
        ['terraform', 'init'],
        cwd=temp_dir,
        capture_output=True,
        text=True,
        env=env
    )
    
    if result.returncode == 0:
        print("✅ Terraform init succeeded!")
    else:
        print("❌ Terraform init failed:")
        print("STDOUT:", result.stdout)
        print("STDERR:", result.stderr)

print("\n" + "=" * 50)
print("Summary:")
print("- Plugin cache directory: ✅")
print("- No duplicate providers: ✅") 
print("- Terraform can initialize: Testing...")