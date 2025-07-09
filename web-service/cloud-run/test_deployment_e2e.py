#!/usr/bin/env python3
"""Test the deployment end-to-end to verify all features work"""

import requests
import json
import time

BASE_URL = "https://anava-deploy-392865621461.us-central1.run.app"

def test_health():
    """Test health endpoint"""
    print("Testing health endpoint...")
    response = requests.get(f"{BASE_URL}/health")
    data = response.json()
    print(f"Health status: {data['status']}")
    print(f"OAuth configured: {data['oauth_configured']}")
    print(f"Redis available: {data['redis_available']}")
    return data['status'] == 'healthy'

def test_ui_has_new_steps():
    """Check if UI has the new 9-step process"""
    print("\nChecking UI for new deployment steps...")
    response = requests.get(f"{BASE_URL}/")
    
    # Check for new step indicators in the HTML
    new_steps = [
        'Initializing Deployment',
        'Creating Service Accounts', 
        'Setting Up Secrets',
        'Configuring Storage',
        'Setting Up Firestore',
        'Deploying Cloud Functions',
        'Creating API Gateway',
        'Configuring Workload Identity',
        'Finalizing Deployment'
    ]
    
    missing_steps = []
    for step in new_steps:
        if step not in response.text:
            missing_steps.append(step)
    
    if missing_steps:
        print(f"❌ Missing steps in UI: {missing_steps}")
        return False
    else:
        print("✅ All 9 deployment steps found in UI")
        return True

def test_no_cleanup_steps():
    """Verify cleanup steps are removed"""
    print("\nChecking for old cleanup steps...")
    response = requests.get(f"{BASE_URL}/")
    
    old_steps = [
        'Cleaning Existing Resources',
        'Waiting for Deletions',
        'Verifying Clean State'
    ]
    
    found_old_steps = []
    for step in old_steps:
        if step in response.text:
            found_old_steps.append(step)
    
    if found_old_steps:
        print(f"❌ Old cleanup steps still present: {found_old_steps}")
        return False
    else:
        print("✅ No cleanup steps found")
        return True

def main():
    print("=" * 60)
    print("E2E Deployment Test")
    print("=" * 60)
    
    tests = [
        ("Health Check", test_health),
        ("New UI Steps", test_ui_has_new_steps),
        ("No Cleanup Steps", test_no_cleanup_steps)
    ]
    
    results = []
    for test_name, test_func in tests:
        try:
            result = test_func()
            results.append((test_name, result))
        except Exception as e:
            print(f"❌ {test_name} failed with error: {e}")
            results.append((test_name, False))
    
    print("\n" + "=" * 60)
    print("Test Summary:")
    print("=" * 60)
    
    for test_name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name}: {status}")
    
    all_passed = all(result for _, result in results)
    
    if not all_passed:
        print("\n⚠️  Some tests failed. The deployment may not have the latest changes.")
        print("Run: gcloud run services describe anava-deploy --region us-central1")
        print("to check the deployment status.")
    else:
        print("\n🎉 All tests passed! The deployment is working correctly.")

if __name__ == "__main__":
    main()