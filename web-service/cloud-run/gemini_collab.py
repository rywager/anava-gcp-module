#!/usr/bin/env python3
"""
Collaborate with Gemini to fix the Firebase storage bucket issue
"""

import requests
import time
import json
from datetime import datetime

GEMINI_PROXY = "https://geminiproxy-p2kamosfwq-uc.a.run.app"

def call_gemini_with_retry(prompt, max_retries=10, delay=5):
    """Call Gemini API with retry logic for 500 errors"""
    
    for attempt in range(max_retries):
        try:
            print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Attempt {attempt + 1}/{max_retries}...")
            
            response = requests.post(
                f"{GEMINI_PROXY}/generate",
                json={"prompt": prompt},
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            
            if response.status_code == 200:
                result = response.json()
                print(f"✅ Success! Got response from Gemini")
                return result
            elif response.status_code == 500:
                print(f"⚠️  Got 500 error, backend might be updating. Waiting {delay} seconds...")
                time.sleep(delay)
            else:
                print(f"❌ Error {response.status_code}: {response.text}")
                time.sleep(delay)
                
        except requests.exceptions.RequestException as e:
            print(f"🔄 Connection error: {e}. Retrying in {delay} seconds...")
            time.sleep(delay)
    
    return None

def main():
    print("🤖 Starting Gemini collaboration for Firebase Storage fix")
    print("=" * 60)
    
    # First, analyze the problem
    analysis_prompt = """
    I need help fixing a Terraform deployment issue for a GCP infrastructure module. The deployment fails with:
    
    Error: Error creating Bucket: googleapi: Error 404: Requested entity was not found.
    
    This happens when trying to create a Firebase storage bucket. The current Terraform code is:

    ```hcl
    resource "google_firebase_storage_bucket" "default" {
      provider = google-beta
      project  = var.project_id
      bucket_id = "${var.project_id}.appspot.com"
    }
    ```

    The issue is that google_firebase_storage_bucket doesn't CREATE buckets, it only makes existing buckets accessible to Firebase.

    Please provide:
    1. The correct way to create and configure a Firebase storage bucket in Terraform
    2. What additional user inputs we need (currently we only collect project_id and region)
    3. Any Firebase-specific setup requirements
    4. The complete fixed Terraform code
    """
    
    print("\n📊 Analyzing the Firebase storage issue...")
    analysis = call_gemini_with_retry(analysis_prompt)
    
    if not analysis:
        print("❌ Failed to get analysis from Gemini after all retries")
        return False
    
    print("\n📝 Gemini's Analysis:")
    print("-" * 60)
    if 'text' in analysis:
        print(analysis['text'])
    else:
        print(json.dumps(analysis, indent=2))
    
    # Now get implementation details
    implementation_prompt = """
    Based on the Firebase storage bucket issue, provide a complete implementation with:
    
    1. EXACT Terraform code to fix the Firebase storage bucket creation
    2. List of ALL required APIs that must be enabled
    3. Any required IAM permissions for service accounts
    4. Validation steps to ensure bucket is properly created
    5. Specific location/region values that work for Firebase storage
    
    Current variables available:
    - var.project_id
    - var.region (defaults to "us-central1")
    - var.resource_prefix
    
    Provide working code that handles both new deployments and existing resources.
    """
    
    print("\n\n🔧 Getting implementation details...")
    implementation = call_gemini_with_retry(implementation_prompt)
    
    if not implementation:
        print("❌ Failed to get implementation from Gemini after all retries")
        return False
    
    print("\n💻 Implementation Plan:")
    print("-" * 60)
    if 'text' in implementation:
        print(implementation['text'])
    else:
        print(json.dumps(implementation, indent=2))
    
    # Save the solution
    solution = {
        "timestamp": datetime.now().isoformat(),
        "analysis": analysis.get('text', str(analysis)),
        "implementation": implementation.get('text', str(implementation))
    }
    
    with open("firebase_storage_solution.json", "w") as f:
        json.dump(solution, f, indent=2)
    
    print("\n\n✅ Solution saved to firebase_storage_solution.json")
    print("🚀 Ready to implement the fix!")
    
    return True

if __name__ == "__main__":
    success = main()
    if not success:
        print("\n⚠️  Some operations failed, but check firebase_storage_solution.json for any partial results")