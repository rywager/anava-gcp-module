#!/usr/bin/env python3
"""
Test a deployment through the API
"""

import requests
import json
import time

# Service URL
SERVICE_URL = "https://anava-deploy-392865621461.us-central1.run.app"

def test_deployment():
    """Test deployment via API"""
    
    # First check health
    print("Checking service health...")
    response = requests.get(f"{SERVICE_URL}/health")
    health = response.json()
    print(f"Service status: {health['status']}")
    print(f"Redis: {health['redis_status']}")
    print(f"Queue length: {health['queue_length']}")
    
    # Check if we need to authenticate
    print("\nTo test deployment:")
    print(f"1. Visit {SERVICE_URL}/login")
    print("2. Authenticate with Google")
    print("3. Select a project and click Deploy")
    print("\nOr use the API directly if you have a session cookie")
    
    # Show the current OAuth redirect URI
    print(f"\nCurrent redirect URI: {health.get('redirect_uri', 'Not set')}")
    
    # Check worker endpoint
    print("\nChecking worker...")
    response = requests.post(f"{SERVICE_URL}/api/worker/process")
    print(f"Worker response: {response.json()}")

if __name__ == "__main__":
    test_deployment()