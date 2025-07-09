#!/usr/bin/env python3
"""Monitor Cloud Run deployment progress"""

import subprocess
import time
import json
from datetime import datetime

def check_deployment_status():
    """Check the latest revision and deployment status"""
    try:
        # Get service status
        result = subprocess.run([
            "gcloud", "run", "services", "describe", "anava-deploy",
            "--region", "us-central1",
            "--format", "json"
        ], capture_output=True, text=True)
        
        if result.returncode != 0:
            return "error", f"Failed to get service status: {result.stderr}"
        
        service = json.loads(result.stdout)
        status = service.get('status', {})
        
        # Check conditions
        conditions = status.get('conditions', [])
        ready = False
        deploying = False
        
        for condition in conditions:
            if condition['type'] == 'Ready':
                ready = condition['status'] == 'True'
            if condition['type'] == 'ConfigurationsReady':
                if condition['status'] != 'True':
                    deploying = True
        
        # Get latest revision info
        latest_created = status.get('latestCreatedRevisionName', 'unknown')
        latest_ready = status.get('latestReadyRevisionName', 'unknown')
        
        if deploying or latest_created != latest_ready:
            return "deploying", {
                "latest_created": latest_created,
                "latest_ready": latest_ready,
                "url": status.get('url', 'unknown')
            }
        elif ready:
            return "ready", {
                "revision": latest_ready,
                "url": status.get('url', 'unknown')
            }
        else:
            return "failed", {
                "conditions": conditions
            }
            
    except Exception as e:
        return "error", str(e)

def main():
    print("🔍 Monitoring Cloud Run deployment...")
    print("=" * 50)
    
    start_time = time.time()
    last_status = None
    
    while True:
        status, details = check_deployment_status()
        timestamp = datetime.now().strftime("%H:%M:%S")
        
        if status != last_status:
            print(f"\n[{timestamp}] Status: {status.upper()}")
            
            if status == "deploying":
                print(f"  📦 Building revision: {details['latest_created']}")
                print(f"  ⏳ Current active: {details['latest_ready']}")
            elif status == "ready":
                elapsed = int(time.time() - start_time)
                print(f"  ✅ Deployment complete!")
                print(f"  🚀 Active revision: {details['revision']}")
                print(f"  🌐 Service URL: {details['url']}")
                print(f"  ⏱️  Total time: {elapsed} seconds")
                
                # Test the health endpoint
                print(f"\n🧪 Testing health endpoint...")
                test_result = subprocess.run([
                    "curl", "-s", f"{details['url']}/health"
                ], capture_output=True, text=True)
                
                if test_result.returncode == 0:
                    try:
                        health = json.loads(test_result.stdout)
                        print(f"  ✅ API is healthy!")
                        print(f"  📊 Status: {health.get('status', 'unknown')}")
                    except:
                        print(f"  ⚠️  Health check returned: {test_result.stdout}")
                else:
                    print(f"  ❌ Health check failed")
                
                print(f"\n🎉 Deployment successful! You can now test at:")
                print(f"   {details['url']}")
                break
                
            elif status == "failed":
                print(f"  ❌ Deployment failed!")
                print(f"  Details: {json.dumps(details, indent=2)}")
                break
            elif status == "error":
                print(f"  ⚠️  Error: {details}")
        else:
            # Print progress dot
            print(".", end="", flush=True)
        
        last_status = status
        time.sleep(5)
        
        # Timeout after 10 minutes
        if time.time() - start_time > 600:
            print(f"\n\n⏱️  Timeout: Deployment taking too long (>10 minutes)")
            break

if __name__ == "__main__":
    main()