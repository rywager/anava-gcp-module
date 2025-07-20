#!/usr/bin/env python3
"""
Fix ALL issues for v2.3.10
"""

import os
import re

def fix_dashboard_js():
    """Fix all JavaScript issues in dashboard"""
    
    # Read current dashboard
    with open('templates/dashboard.html', 'r') as f:
        content = f.read()
    
    # 1. Fix processProgressMessage to handle API progress
    old_progress_func = '''// Process progress update - FIXED VERSION
        function processProgressMessage(message) {
            console.log('Processing progress:', message);
            
            // Extract resource creation progress
            const resourceMatch = message.match(/Created resource (\d+)(?:\/(\d+))?: (.+)/);
            if (resourceMatch) {'''
    
    new_progress_func = '''// Process progress update - FIXED VERSION
        function processProgressMessage(message) {
            console.log('Processing progress:', message);
            
            // Handle API enablement progress
            const apiMatch = message.match(/API (\d+)\/(\d+) - (.+)/);
            if (apiMatch) {
                const [_, current, total, status] = apiMatch;
                updateStepStatus('enabling-apis', 'active', {
                    'Progress': `${current} of ${total} APIs enabled`
                });
                return;
            }
            
            // Extract resource creation progress
            const resourceMatch = message.match(/Created resource (\d+)(?:\/(\d+))?: (.+)/);
            if (resourceMatch) {'''
    
    content = content.replace(old_progress_func, new_progress_func)
    
    # 2. Fix STATUS message mapping to include all statuses
    old_status_map = '''const statusMap = {
                'DEPLOYMENT_STARTED': { step: 'enabling-apis', action: 'start' },
                'ENABLING_APIS': { step: 'enabling-apis', action: 'active' },
                'SETTING_PERMISSIONS': { step: 'permissions', action: 'active', complete: 'enabling-apis' },
                'PREPARING_TERRAFORM': { step: 'terraform-init', action: 'active', complete: 'permissions' },
                'TERRAFORM_INIT': { step: 'terraform-init', action: 'active' },
                'CREATING_SERVICE_ACCOUNTS': { step: 'service-accounts', action: 'active', complete: 'terraform-init' },
                'CREATING_SECRETS': { step: 'secrets', action: 'active', complete: 'service-accounts' },
                'CREATING_STORAGE': { step: 'storage', action: 'active', complete: 'secrets' },
                'CREATING_FIRESTORE': { step: 'firestore', action: 'active', complete: 'storage' },
                'CREATING_CLOUD_FUNCTIONS': { step: 'functions', action: 'active', complete: 'firestore' },
                'CREATING_API_GATEWAY': { step: 'api-gateway', action: 'active', complete: 'functions' },
                'DEPLOYMENT_COMPLETE': { step: 'api-gateway', action: 'complete' }
            };'''
    
    new_status_map = '''const statusMap = {
                'DEPLOYMENT_STARTED': { step: 'enabling-apis', action: 'start' },
                'ENABLING_APIS': { step: 'enabling-apis', action: 'active' },
                'SETTING_PERMISSIONS': { step: 'permissions', action: 'active', complete: 'enabling-apis' },
                'PREPARING_TERRAFORM': { step: 'terraform-init', action: 'active', complete: 'permissions' },
                'TERRAFORM_INIT': { step: 'terraform-init', action: 'active' },
                'TERRAFORM_PLAN': { step: 'terraform-init', action: 'active' },
                'IMPORTING_EXISTING': { step: 'terraform-init', action: 'active' },
                'CREATING_RESOURCES': { step: 'service-accounts', action: 'active', complete: 'terraform-init' },
                'CREATING_SERVICE_ACCOUNTS': { step: 'service-accounts', action: 'active', complete: 'terraform-init' },
                'CREATING_SECRETS': { step: 'secrets', action: 'active', complete: 'service-accounts' },
                'CREATING_STORAGE': { step: 'storage', action: 'active', complete: 'secrets' },
                'CREATING_FIRESTORE': { step: 'firestore', action: 'active', complete: 'storage' },
                'CREATING_CLOUD_FUNCTIONS': { step: 'functions', action: 'active', complete: 'firestore' },
                'CREATING_API_GATEWAY': { step: 'api-gateway', action: 'active', complete: 'functions' },
                'RETRIEVING_OUTPUTS': { step: 'api-gateway', action: 'active' },
                'DEPLOYMENT_COMPLETE': { step: 'api-gateway', action: 'complete' }
            };'''
    
    content = content.replace(old_status_map, new_status_map)
    
    # 3. Update version
    content = content.replace('v2.3.9', 'v2.3.10')
    
    # Write updated dashboard
    with open('templates/dashboard.html', 'w') as f:
        f.write(content)
    
    print("✅ Fixed dashboard JavaScript issues")

def fix_main_py():
    """Fix backend issues in main.py"""
    
    with open('main.py', 'r') as f:
        content = f.read()
    
    # 1. Update version
    content = content.replace('VERSION = "2.3.9"', 'VERSION = "2.3.10"')
    
    # 2. Add progress update after API enablement
    old_success = '''log("SUCCESS: All APIs processed")'''
    new_success = '''log("SUCCESS: All APIs processed")
        log("STATUS: SETTING_PERMISSIONS")  # Force status update'''
    
    content = content.replace(old_success, new_success)
    
    # 3. Add timeout to API enablement (30 seconds total)
    old_executor = '''with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:'''
    new_executor = '''# Add timeout to prevent hanging
        import signal
        from contextlib import contextmanager
        
        @contextmanager
        def timeout(seconds):
            def signal_handler(signum, frame):
                raise TimeoutError(f"Operation timed out after {seconds} seconds")
            signal.signal(signal.SIGALRM, signal_handler)
            signal.alarm(seconds)
            try:
                yield
            finally:
                signal.alarm(0)
        
        try:
            with timeout(30):  # 30 second timeout for all API enablement
                with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:'''
    
    content = content.replace(old_executor, new_executor)
    
    # Add proper indentation for the timeout
    content = content.replace(
        'log("SUCCESS: All APIs processed")',
        '    log("SUCCESS: All APIs processed")\n        except TimeoutError:\n            log("WARNING: API enablement timed out after 30 seconds")'
    )
    
    # Write updated main.py
    with open('main.py', 'w') as f:
        f.write(content)
    
    print("✅ Fixed main.py backend issues")

def fix_terraform_module():
    """Fix Firebase Release conflict in Terraform"""
    
    # Find the file with Firebase rules
    firestore_file = 'terraform-anava-module/firestore.tf'
    
    if os.path.exists(firestore_file):
        with open(firestore_file, 'r') as f:
            content = f.read()
        
        # Add lifecycle rule to Firebase releases to prevent conflicts
        if 'google_firebaserules_release' in content:
            # Add lifecycle block after each release resource
            pattern = r'(resource "google_firebaserules_release"[^}]+})'
            
            def add_lifecycle(match):
                resource_block = match.group(1)
                if 'lifecycle' not in resource_block:
                    # Insert lifecycle before the closing brace
                    insert_pos = resource_block.rfind('}')
                    lifecycle = '''
  
  lifecycle {
    create_before_destroy = true
    ignore_changes = [ruleset_name]
  }'''
                    return resource_block[:insert_pos] + lifecycle + '\n' + resource_block[insert_pos:]
                return resource_block
            
            content = re.sub(pattern, add_lifecycle, content, flags=re.DOTALL)
            
            with open(firestore_file, 'w') as f:
                f.write(content)
            
            print("✅ Fixed Firebase Release lifecycle in Terraform")
    else:
        print("⚠️  Could not find firestore.tf file")

def create_comprehensive_fix():
    """Apply all fixes"""
    print("Applying ALL fixes for v2.3.10...")
    
    fix_dashboard_js()
    fix_main_py()
    fix_terraform_module()
    
    print("\n🎉 All fixes applied!")
    print("\nFixed issues:")
    print("1. UI now parses API progress messages")
    print("2. STATUS transitions fixed - won't stick on 'Enabling APIs'")
    print("3. Added 30-second timeout to API enablement")
    print("4. Firebase Release conflicts handled with lifecycle rules")
    print("5. Version updated to 2.3.10")

if __name__ == "__main__":
    create_comprehensive_fix()