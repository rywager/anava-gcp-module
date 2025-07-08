#!/usr/bin/env python3
"""
Test deployment readiness
"""

import requests
import json

BASE_URL = "https://anava-deploy-392865621461.us-central1.run.app"

def test_module_accessibility():
    """Test if the Terraform module is accessible"""
    print("📦 Testing Terraform module accessibility...")
    
    try:
        # Test if GitHub repo is publicly accessible
        resp = requests.get("https://github.com/rywager/anava-gcp-module", timeout=10)
        if resp.status_code == 200:
            print("✅ GitHub repository is accessible")
            
            # Test if main.tf is accessible
            resp = requests.get("https://raw.githubusercontent.com/rywager/anava-gcp-module/master/main.tf", timeout=10)
            if resp.status_code == 200:
                print("✅ Terraform module main.tf is accessible")
                
                # Test if outputs.tf is accessible
                resp = requests.get("https://raw.githubusercontent.com/rywager/anava-gcp-module/master/outputs.tf", timeout=10)
                if resp.status_code == 200:
                    print("✅ Terraform module outputs.tf is accessible")
                    return True
                else:
                    print(f"❌ outputs.tf not accessible: {resp.status_code}")
                    return False
            else:
                print(f"❌ main.tf not accessible: {resp.status_code}")
                return False
        else:
            print(f"❌ GitHub repository not accessible: {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ Module accessibility test error: {e}")
        return False

def test_service_health():
    """Test service health"""
    print("🏥 Testing service health...")
    
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=10)
        if resp.status_code == 200:
            health = resp.json()
            print(f"✅ Service is healthy: {health.get('status', 'unknown')}")
            print(f"   OAuth configured: {health.get('oauth_configured', False)}")
            return True
        else:
            print(f"❌ Health check failed: {resp.status_code}")
            return False
    except Exception as e:
        print(f"❌ Health check error: {e}")
        return False

def main():
    print("🧪 DEPLOYMENT READINESS TEST")
    print("=" * 40)
    
    health_ok = test_service_health()
    module_ok = test_module_accessibility()
    
    print(f"\n📊 Results:")
    print(f"   Service Health: {'✅' if health_ok else '❌'}")
    print(f"   Module Access: {'✅' if module_ok else '❌'}")
    
    if health_ok and module_ok:
        print(f"\n🎉 System is ready for deployment!")
        print(f"Customers can visit {BASE_URL} to deploy infrastructure")
        return True
    else:
        print(f"\n⚠️  System needs fixes")
        return False

if __name__ == "__main__":
    main()