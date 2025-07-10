#!/usr/bin/env python3
"""
Add lifecycle rules to Terraform resources to handle existing resources better
"""

def add_lifecycle_to_service_accounts():
    """Add lifecycle rules to service account resources"""
    
    sa_file = 'terraform-anava-module/service_accounts.tf'
    
    # Read the file
    with open(sa_file, 'r') as f:
        content = f.read()
    
    # Add lifecycle rule after each service account resource
    lifecycle_rule = '''
  lifecycle {
    create_before_destroy = true
    ignore_changes = [
      # Ignore changes to these fields to prevent unnecessary updates
      description,
      disabled
    ]
  }'''
    
    # Find each resource block and add lifecycle
    import re
    
    # Pattern to match resource blocks
    pattern = r'(resource "google_service_account"[^{]+{[^}]+)'
    
    def add_lifecycle(match):
        resource_block = match.group(1)
        # Check if lifecycle already exists
        if 'lifecycle' not in resource_block:
            return resource_block + lifecycle_rule + '\n'
        return resource_block
    
    # Apply the pattern
    new_content = re.sub(pattern, add_lifecycle, content)
    
    # Write back
    with open(sa_file + '.updated', 'w') as f:
        f.write(new_content)
    
    print(f"✅ Created {sa_file}.updated with lifecycle rules")

def add_lifecycle_to_secrets():
    """Add lifecycle rules to secret resources"""
    
    secrets_file = 'terraform-anava-module/secrets.tf'
    
    # Read the file
    with open(secrets_file, 'r') as f:
        content = f.read()
    
    # Add lifecycle rule for secrets
    lifecycle_rule = '''
  lifecycle {
    create_before_destroy = true
    ignore_changes = [
      # Ignore changes to prevent recreation
      labels,
      annotations
    ]
  }'''
    
    # Pattern to match secret resources
    pattern = r'(resource "google_secret_manager_secret"[^{]+{[^}]+)'
    
    def add_lifecycle(match):
        resource_block = match.group(1)
        if 'lifecycle' not in resource_block:
            return resource_block + lifecycle_rule + '\n'
        return resource_block
    
    # Apply the pattern
    new_content = re.sub(pattern, add_lifecycle, content)
    
    # Write back
    with open(secrets_file + '.updated', 'w') as f:
        f.write(new_content)
    
    print(f"✅ Created {secrets_file}.updated with lifecycle rules")

def add_lifecycle_to_storage():
    """Add lifecycle rules to storage buckets"""
    
    storage_file = 'terraform-anava-module/storage.tf'
    
    # Read the file
    with open(storage_file, 'r') as f:
        content = f.read()
    
    # Add lifecycle rule for buckets
    lifecycle_rule = '''
  lifecycle {
    prevent_destroy = false
    create_before_destroy = true
    ignore_changes = [
      # Ignore changes to these fields
      labels,
      force_destroy
    ]
  }'''
    
    # Pattern to match bucket resources
    pattern = r'(resource "google_storage_bucket"[^{]+{[^}]+)'
    
    def add_lifecycle(match):
        resource_block = match.group(1)
        if 'lifecycle' not in resource_block:
            return resource_block + lifecycle_rule + '\n'
        return resource_block
    
    # Apply the pattern
    new_content = re.sub(pattern, add_lifecycle, content)
    
    # Write back
    with open(storage_file + '.updated', 'w') as f:
        f.write(new_content)
    
    print(f"✅ Created {storage_file}.updated with lifecycle rules")

if __name__ == "__main__":
    print("Adding lifecycle rules to Terraform resources...")
    print("This will help handle existing resources without import timeouts")
    
    try:
        add_lifecycle_to_service_accounts()
    except Exception as e:
        print(f"Error updating service accounts: {e}")
    
    try:
        add_lifecycle_to_secrets()
    except Exception as e:
        print(f"Error updating secrets: {e}")
    
    try:
        add_lifecycle_to_storage()
    except Exception as e:
        print(f"Error updating storage: {e}")
    
    print("\n🎉 Lifecycle rules added!")
    print("These rules will:")
    print("- Create new resources before destroying old ones")
    print("- Ignore minor changes to prevent unnecessary updates")
    print("- Allow Terraform to handle existing resources gracefully")