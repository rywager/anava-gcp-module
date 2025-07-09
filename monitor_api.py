#!/usr/bin/env python3
"""Monitor API deployment status"""

import requests
import time
import sys
from datetime import datetime

BASE_URL = "https://anava-deploy-392865621461.us-central1.run.app"

def check_api_health():
    """Check if API is healthy"""
    try:
        resp = requests.get(f"{BASE_URL}/health", timeout=10)
        if resp.status_code == 200:
            health = resp.json()
            return True, f"API is healthy - Status: {health.get('status', 'unknown')}, OAuth: {health.get('oauth_configured', False)}"
        else:
            return False, f"API returned status code: {resp.status_code}"
    except requests.exceptions.ConnectionError:
        return False, "Connection refused - API not responding"
    except requests.exceptions.Timeout:
        return False, "Request timed out"
    except Exception as e:
        return False, f"Error: {str(e)}"

def main():
    print(f"🔍 Monitoring API at {BASE_URL}")
    print("Press Ctrl+C to stop\n")
    
    check_count = 0
    success_count = 0
    
    try:
        while True:
            check_count += 1
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            is_healthy, message = check_api_health()
            
            if is_healthy:
                success_count += 1
                print(f"✅ [{timestamp}] Check #{check_count}: {message}")
            else:
                print(f"❌ [{timestamp}] Check #{check_count}: {message}")
            
            if check_count % 10 == 0:
                success_rate = (success_count / check_count) * 100
                print(f"\n📊 Stats: {success_count}/{check_count} successful ({success_rate:.1f}%)\n")
            
            time.sleep(5)  # Check every 5 seconds
            
    except KeyboardInterrupt:
        print(f"\n\n🛑 Monitoring stopped")
        print(f"📊 Final stats: {success_count}/{check_count} successful ({(success_count/check_count)*100:.1f}%)")
        sys.exit(0)

if __name__ == "__main__":
    main()