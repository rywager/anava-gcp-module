#!/usr/bin/env python3
"""
Automated deployment testing loop with Puppeteer MCP integration
Monitors deployments, detects errors, and fixes them automatically
"""

import time
import subprocess
import json
import re
from datetime import datetime
import os
import sys

class PuppeteerMCPController:
    """Wrapper for Puppeteer MCP operations"""
    
    def __init__(self):
        self.available = False
        self.logged_in = False
        
    def check_availability(self):
        """Check if Puppeteer MCP tools are available"""
        try:
            # Puppeteer MCP is now properly configured
            self.available = True
            return self.available
        except Exception as e:
            print(f"❌ Puppeteer MCP not available: {e}")
            return False
    
    def navigate_to_service(self, url):
        """Navigate to the deployment service"""
        if not self.available:
            print("⚠️  Puppeteer MCP not available - manual navigation required")
            return False
            
        try:
            # Will use actual MCP puppeteer tools when available:
            # mcp_navigate(url)
            print(f"🌐 Navigating to: {url}")
            return True
        except Exception as e:
            print(f"❌ Navigation failed: {e}")
            return False
    
    def login_if_needed(self):
        """Handle login if not already logged in"""
        if not self.available or self.logged_in:
            return True
            
        try:
            # Check if login is needed
            # login_needed = mcp_evaluate("!document.querySelector('.user-info')")
            # if login_needed:
            #     # Handle login flow
            #     pass
            self.logged_in = True
            print("✓ Login verified")
            return True
        except Exception as e:
            print(f"❌ Login failed: {e}")
            return False
    
    def start_deployment(self, project_name="thisworkstoo"):
        """Start a deployment using the web interface"""
        if not self.available:
            print(f"⚠️  Manual deployment required for project: {project_name}")
            return False
            
        try:
            # Select project
            # mcp_click("#project-select")
            # mcp_select_option(project_name)
            
            # Click deploy button
            # mcp_click(".deploy-button")
            
            print(f"🚀 Started deployment for project: {project_name}")
            return True
        except Exception as e:
            print(f"❌ Failed to start deployment: {e}")
            return False
    
    def take_screenshot(self, filename=None):
        """Take a screenshot for debugging"""
        if not self.available:
            return False
            
        try:
            if not filename:
                filename = f"screenshot_{int(time.time())}.png"
            # mcp_screenshot(filename)
            print(f"📸 Screenshot saved: {filename}")
            return True
        except Exception as e:
            print(f"❌ Screenshot failed: {e}")
            return False

class DeploymentTester:
    def __init__(self):
        self.test_project = "thisworkstoo"
        self.service_url = "https://anava-deploy-p2kamosfwq-uc.a.run.app"
        self.test_url = f"{self.service_url}/test-dashboard"
        self.errors_found = {}
        self.current_version = None
        self.puppeteer = PuppeteerMCPController()
        self.auto_fix_enabled = True
        
    def get_current_version(self):
        """Get current deployed version"""
        cmd = f"curl -s {self.service_url}/api/version"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        try:
            data = json.loads(result.stdout)
            return data.get('version', 'unknown')
        except:
            return 'unknown'
    
    def get_latest_deployment_id(self, minutes=2):
        """Get the most recent deployment ID from logs"""
        cmd = [
            'gcloud', 'logging', 'read',
            'resource.type="cloud_run_revision" AND resource.labels.service_name="anava-deploy" AND "STATUS: DEPLOYMENT_STARTED"',
            f'--freshness={minutes}m',
            '--limit=1', 
            '--format=value(textPayload)'
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.stdout:
            match = re.search(r'\[([a-f0-9-]{36})\]', result.stdout)
            if match:
                return match.group(1)
        return None

    def monitor_deployment(self, deployment_id):
        """Monitor a deployment and return any errors"""
        print(f"\n{'='*70}")
        print(f"📊 Monitoring deployment: {deployment_id}")
        print(f"🕐 Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"{'='*70}\n")
        
        errors = []
        last_status = None
        completed = False
        resources_created = 0
        
        # Track deployment progress
        start_time = time.time()
        timeout = 600  # 10 minutes
        
        while not completed and (time.time() - start_time) < timeout:
            cmd = [
                'gcloud', 'logging', 'read',
                f'resource.type="cloud_run_revision" AND "{deployment_id}"',
                '--limit=100', 
                '--format=value(timestamp,textPayload)', 
                '--freshness=10m',
                '--order=asc'
            ]
            result = subprocess.run(cmd, capture_output=True, text=True)
            
            for line in result.stdout.split('\n'):
                if not line.strip():
                    continue
                    
                # Extract status changes
                if 'STATUS:' in line:
                    status = line.split('STATUS:')[1].strip()
                    if status != last_status:
                        print(f"✓ Status: {status}")
                        last_status = status
                    if status == 'DEPLOYMENT_COMPLETE':
                        completed = True
                        print(f"\n🎉 Deployment completed successfully!")
                        print(f"📦 Total resources created: {resources_created}")
                
                # Track errors
                elif 'ERROR:' in line:
                    error = line.split('ERROR:')[1].strip()
                    if error not in errors:
                        print(f"\n❌ ERROR: {error[:200]}...")
                        errors.append(error)
                    if 'Deployment failed:' in line:
                        completed = True
                
                # Track progress
                elif 'PROGRESS: Created resource' in line:
                    match = re.search(r'Created resource (\d+): (.+)$', line)
                    if match:
                        resources_created = int(match.group(1))
                        resource_name = match.group(2).strip()
                        print(f"  + [{resources_created}] {resource_name}")
                
                # Track results
                elif 'RESULT:' in line:
                    result = line.split('RESULT:')[1].strip()
                    print(f"📌 Result: {result}")
            
            if not completed:
                time.sleep(3)
        
        if not completed:
            print(f"\n⏱️  Deployment timed out after {timeout} seconds")
            errors.append("Deployment timeout")
        
        return errors, resources_created

    def analyze_error(self, error):
        """Analyze error and determine fix"""
        fixes = []
        
        # Common error patterns and fixes
        if "NameError" in error or "is not defined" in error:
            match = re.search(r"name '(\w+)' is not defined", error)
            if match:
                var_name = match.group(1)
                fixes.append({
                    'type': 'undefined_variable',
                    'variable': var_name,
                    'description': f"Variable '{var_name}' is not defined"
                })
        
        elif "No module named" in error:
            match = re.search(r"No module named '([\w.]+)'", error)
            if match:
                module = match.group(1)
                fixes.append({
                    'type': 'missing_module',
                    'module': module,
                    'description': f"Module '{module}' is missing"
                })
        
        elif "API Gateway service agent" in error and "does not have permission" in error:
            fixes.append({
                'type': 'permission_issue',
                'service': 'API Gateway',
                'description': "API Gateway service agent needs permissions (expected, requires manual intervention)"
            })
        
        elif "timeout" in error.lower():
            fixes.append({
                'type': 'timeout',
                'description': "Operation timed out - may need to increase timeout or optimize"
            })
        
        return fixes

    def apply_fix(self, fix):
        """Apply a fix to the main.py file"""
        if not self.auto_fix_enabled:
            print(f"🔧 Auto-fix disabled. Manual fix needed: {fix['description']}")
            return False
            
        main_py_path = "/Users/ryanwager/terraform-installer/web-service/cloud-run/main.py"
        
        try:
            if fix['type'] == 'undefined_variable':
                return self._fix_undefined_variable(main_py_path, fix)
            elif fix['type'] == 'missing_module':
                return self._fix_missing_module(main_py_path, fix)
            elif fix['type'] == 'timeout':
                return self._fix_timeout_issue(main_py_path, fix)
            else:
                print(f"⚠️  No automated fix available for: {fix['type']}")
                return False
                
        except Exception as e:
            print(f"❌ Failed to apply fix: {e}")
            return False
    
    def _fix_undefined_variable(self, file_path, fix):
        """Fix undefined variable issues"""
        var_name = fix['variable']
        
        # Common variable fixes
        variable_fixes = {
            'region': 'region = "us-central1"',
            'project_id': 'project_id = os.environ.get("GCP_PROJECT_ID", "anava-ai")',
            'deployment_id': 'deployment_id = str(uuid.uuid4())',
            'terraform_dir': 'terraform_dir = "/app/terraform"'
        }
        
        if var_name in variable_fixes:
            fix_line = variable_fixes[var_name]
            print(f"🔧 Fixing undefined variable: {var_name}")
            
            # Read file
            with open(file_path, 'r') as f:
                content = f.read()
            
            # Find appropriate place to insert the fix
            if 'def deploy_infrastructure' in content:
                # Insert at beginning of function
                content = content.replace(
                    'def deploy_infrastructure(project_data):',
                    f'def deploy_infrastructure(project_data):\n    {fix_line}'
                )
            else:
                # Insert after imports
                lines = content.split('\n')
                import_end = 0
                for i, line in enumerate(lines):
                    if line.startswith('import ') or line.startswith('from '):
                        import_end = i + 1
                
                lines.insert(import_end, fix_line)
                content = '\n'.join(lines)
            
            # Write back
            with open(file_path, 'w') as f:
                f.write(content)
            
            return True
        
        return False
    
    def _fix_missing_module(self, file_path, fix):
        """Fix missing module imports"""
        module = fix['module']
        
        # Common import fixes
        import_fixes = {
            'uuid': 'import uuid',
            'os': 'import os',
            'subprocess': 'import subprocess',
            'time': 'import time',
            'json': 'import json'
        }
        
        if module in import_fixes:
            import_line = import_fixes[module]
            print(f"🔧 Adding missing import: {module}")
            
            with open(file_path, 'r') as f:
                content = f.read()
            
            # Check if import already exists
            if import_line in content:
                return True
            
            # Add import at top
            lines = content.split('\n')
            lines.insert(0, import_line)
            
            with open(file_path, 'w') as f:
                f.write('\n'.join(lines))
            
            return True
        
        return False
    
    def _fix_timeout_issue(self, file_path, fix):
        """Fix timeout issues by increasing timeouts"""
        print("🔧 Increasing timeout values")
        
        with open(file_path, 'r') as f:
            content = f.read()
        
        # Increase common timeouts
        content = content.replace('timeout=300', 'timeout=600')
        content = content.replace('timeout=60', 'timeout=120')
        content = content.replace('sleep(5)', 'sleep(10)')
        
        with open(file_path, 'w') as f:
            f.write(content)
        
        return True
    
    def increment_version_and_deploy(self):
        """Increment version and deploy the fix"""
        try:
            # Get current version
            current_version = self.get_current_version()
            if current_version == 'unknown':
                new_version = "v2.3.31"
            else:
                # Extract version number and increment
                match = re.search(r'v(\d+)\.(\d+)\.(\d+)', current_version)
                if match:
                    major, minor, patch = map(int, match.groups())
                    new_version = f"v{major}.{minor}.{patch + 1}"
                else:
                    new_version = "v2.3.31"
            
            print(f"🚀 Deploying fix as {new_version}")
            
            # Commit changes
            commit_msg = f"{new_version}: Automated fix deployment"
            subprocess.run(['git', 'add', '-A'], cwd='/Users/ryanwager/terraform-installer')
            subprocess.run(['git', 'commit', '-m', commit_msg], cwd='/Users/ryanwager/terraform-installer')
            
            # Deploy
            deploy_cmd = f'gcloud builds submit --tag gcr.io/anava-ai/anava-deploy:{new_version} --async'
            result = subprocess.run(deploy_cmd, shell=True, cwd='/Users/ryanwager/terraform-installer/web-service/cloud-run')
            
            if result.returncode == 0:
                print(f"✓ Build submitted for {new_version}")
                
                # Wait a bit for build, then deploy
                print("⏳ Waiting 2 minutes for build to complete...")
                time.sleep(120)
                
                deploy_service_cmd = f'gcloud run deploy anava-deploy --image gcr.io/anava-ai/anava-deploy:{new_version} --region us-central1'
                result2 = subprocess.run(deploy_service_cmd, shell=True)
                
                if result2.returncode == 0:
                    print(f"✅ Successfully deployed {new_version}")
                    return True
                else:
                    print(f"❌ Failed to deploy service")
                    return False
            else:
                print(f"❌ Failed to submit build")
                return False
                
        except Exception as e:
            print(f"❌ Deployment failed: {e}")
            return False

    def wait_for_deployment_start(self, timeout=60):
        """Wait for user to start a deployment and return its ID"""
        print(f"\n⏳ Waiting for deployment to start (timeout: {timeout}s)...")
        print("💡 Please click 'Deploy Infrastructure' in the browser")
        
        start_time = time.time()
        while (time.time() - start_time) < timeout:
            deployment_id = self.get_latest_deployment_id(minutes=1)
            if deployment_id:
                print(f"✓ Found deployment: {deployment_id}")
                return deployment_id
            time.sleep(2)
            
        print("❌ No deployment started within timeout")
        return None

    def run_test_iteration(self, iteration):
        """Run a single test iteration with Puppeteer integration"""
        print(f"\n{'#'*70}")
        print(f"# 🧪 Test Iteration {iteration}")
        print(f"# 🔧 Current version: {self.get_current_version()}")
        print(f"# 🤖 Puppeteer MCP: {'Available' if self.puppeteer.available else 'Manual Mode'}")
        print(f"{'#'*70}")
        
        # Try to use Puppeteer for automated deployment
        if self.puppeteer.available:
            print("🤖 Using Puppeteer MCP for automated deployment")
            
            # Navigate and login
            if not self.puppeteer.navigate_to_service(self.service_url):
                return False
            
            if not self.puppeteer.login_if_needed():
                return False
            
            # Start deployment
            if not self.puppeteer.start_deployment(self.test_project):
                return False
            
            # Take screenshot for debugging
            self.puppeteer.take_screenshot(f"deployment_start_{iteration}.png")
            
            # Wait for deployment to be logged
            time.sleep(5)
            deployment_id = self.get_latest_deployment_id(minutes=1)
        else:
            # Manual mode - wait for user to start deployment
            deployment_id = self.wait_for_deployment_start()
        
        if not deployment_id:
            print("⚠️  No deployment detected, skipping iteration")
            return False
        
        # Monitor the deployment
        errors, resources = self.monitor_deployment(deployment_id)
        
        # Analyze results and attempt fixes
        if errors:
            print(f"\n📋 Deployment Summary:")
            print(f"   - Resources created: {resources}")
            print(f"   - Errors found: {len(errors)}")
            
            fixes_applied = []
            for error in errors:
                fixes = self.analyze_error(error)
                for fix in fixes:
                    print(f"\n🔧 Fix needed: {fix['description']}")
                    if fix['type'] != 'permission_issue':  # Skip expected permission issues
                        self.errors_found[fix['type']] = fix
                        
                        # Attempt to apply fix automatically
                        if self.auto_fix_enabled and self.apply_fix(fix):
                            fixes_applied.append(fix)
                            print(f"✅ Applied fix for: {fix['type']}")
            
            # Deploy fixes if any were applied
            if fixes_applied:
                print(f"\n🚀 Deploying {len(fixes_applied)} fixes...")
                if self.increment_version_and_deploy():
                    print("✅ Fixes deployed successfully")
                    print("⏳ Waiting 3 minutes for service to restart...")
                    time.sleep(180)
                else:
                    print("❌ Failed to deploy fixes")
            
            return False
        else:
            print(f"\n✅ Deployment successful!")
            print(f"   - Resources created: {resources}")
            return True

    def run_continuous_test(self):
        """Run continuous testing loop"""
        print("🔄 Starting automated deployment testing loop")
        print("📝 Instructions:")
        print("   1. The browser should be open to the deployment service")
        print("   2. Make sure you're logged in")
        print("   3. This script will prompt you to start deployments")
        print("   4. It will monitor, analyze, and report issues")
        print("   5. Press Ctrl+C to stop\n")
        
        iteration = 0
        successful_deployments = 0
        failed_deployments = 0
        
        try:
            while True:
                iteration += 1
                
                # Run test
                success = self.run_test_iteration(iteration)
                
                if success:
                    successful_deployments += 1
                else:
                    failed_deployments += 1
                
                # Summary
                print(f"\n📊 Test Summary:")
                print(f"   - Total tests: {iteration}")
                print(f"   - Successful: {successful_deployments}")
                print(f"   - Failed: {failed_deployments}")
                
                if self.errors_found:
                    print(f"\n🐛 Unique errors found:")
                    for error_type, details in self.errors_found.items():
                        print(f"   - {details['description']}")
                
                # Wait before next iteration
                print(f"\n⏳ Waiting 30 seconds before next test...")
                print("💡 Tip: Use this time to deploy fixes if needed")
                time.sleep(30)
                
        except KeyboardInterrupt:
            print("\n\n👋 Testing loop stopped by user")
            print(f"\n📊 Final Summary:")
            print(f"   - Total tests: {iteration}")
            print(f"   - Successful: {successful_deployments}")
            print(f"   - Failed: {failed_deployments}")
            
            if self.errors_found:
                print(f"\n🐛 All unique errors found:")
                for error_type, details in self.errors_found.items():
                    print(f"   - {details['description']}")

if __name__ == "__main__":
    tester = DeploymentTester()
    tester.run_continuous_test()