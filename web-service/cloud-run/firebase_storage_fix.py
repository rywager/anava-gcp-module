#!/usr/bin/env python3
"""
Fix for Firebase Storage Bucket deployment issue
"""

import json
from datetime import datetime

def generate_firebase_storage_fix():
    """Generate the complete fix for Firebase storage bucket issue"""
    
    fix = {
        "problem": "Firebase storage bucket creation fails because google_firebase_storage_bucket doesn't create buckets, only makes existing ones accessible to Firebase",
        
        "solution": {
            "overview": "Create the actual Cloud Storage bucket first, then make it Firebase-accessible",
            
            "required_inputs": {
                "existing": [
                    "project_id",
                    "region"
                ],
                "new_required": [
                    {
                        "name": "storage_location",
                        "type": "dropdown",
                        "label": "Storage Location",
                        "options": [
                            {"value": "US", "label": "US (Multi-region)"},
                            {"value": "EU", "label": "EU (Multi-region)"},
                            {"value": "ASIA", "label": "Asia (Multi-region)"},
                            {"value": "us-central1", "label": "US Central 1 (Single region)"},
                            {"value": "us-east1", "label": "US East 1 (Single region)"},
                            {"value": "europe-west1", "label": "Europe West 1 (Single region)"},
                            {"value": "asia-southeast1", "label": "Asia Southeast 1 (Single region)"}
                        ],
                        "default": "US",
                        "description": "Location for Firebase Storage bucket. Multi-region provides better availability."
                    },
                    {
                        "name": "enable_firebase_features",
                        "type": "checkbox", 
                        "label": "Enable Firebase Features",
                        "default": True,
                        "description": "Enable Firebase Storage, Firestore, and Authentication"
                    }
                ]
            },
            
            "terraform_changes": {
                "variables": """
# Add to variables.tf
variable "storage_location" {
  description = "Location for Firebase Storage bucket (e.g., US, EU, us-central1)"
  type        = string
  default     = "US"
}

variable "enable_firebase_features" {
  description = "Enable Firebase features (Storage, Firestore, Auth)"
  type        = bool
  default     = true
}
""",
                
                "firebase_storage": """
# Replace the existing google_firebase_storage_bucket resource with:

# First, create the actual storage bucket
resource "google_storage_bucket" "firebase_bucket" {
  count    = var.enable_firebase_features ? 1 : 0
  project  = var.project_id
  name     = "${var.project_id}.appspot.com"
  location = var.storage_location
  
  # Firebase-compatible settings
  uniform_bucket_level_access = true
  force_destroy              = false
  
  versioning {
    enabled = true
  }
  
  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }
  
  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type = "Delete"
    }
  }
  
  depends_on = [
    google_project_service.required_apis["storage.googleapis.com"],
    google_project_service.required_apis["firebasestorage.googleapis.com"]
  ]
}

# Then make it accessible to Firebase
resource "google_firebase_storage_bucket" "default" {
  count     = var.enable_firebase_features ? 1 : 0
  provider  = google-beta
  project   = var.project_id
  bucket_id = google_storage_bucket.firebase_bucket[0].name

  depends_on = [
    google_firebase_project.default,
    google_storage_bucket.firebase_bucket[0]
  ]
}

# Also fix the default bucket creation for App Engine (required by Firebase)
resource "google_app_engine_application" "default" {
  count       = var.enable_firebase_features ? 1 : 0
  project     = var.project_id
  location_id = var.storage_location == "US" ? "us-central" : 
                var.storage_location == "EU" ? "europe-west" :
                var.storage_location == "ASIA" ? "asia-southeast1" :
                var.region
  
  depends_on = [
    google_project_service.required_apis["appengine.googleapis.com"]
  ]
}
""",
                
                "api_additions": """
# Add to the required_apis list in main.tf:
"firebase.googleapis.com" = "run"
"firebaseappcheck.googleapis.com" = "run"
"firebasehosting.googleapis.com" = "run" 
"firebaseinstallations.googleapis.com" = "run"
"appengine.googleapis.com" = "build"  # Required for default bucket
""",
                
                "iam_additions": """
# Add Firebase-specific IAM permissions
resource "google_project_iam_member" "firebase_admin" {
  count   = var.enable_firebase_features ? 1 : 0
  project = var.project_id
  role    = "roles/firebase.admin"
  member  = "serviceAccount:${google_service_account.terraform.email}"
  
  depends_on = [google_project_service.required_apis]
}

resource "google_project_iam_member" "storage_admin_for_firebase" {
  count   = var.enable_firebase_features ? 1 : 0
  project = var.project_id
  role    = "roles/storage.admin"
  member  = "serviceAccount:service-${google_project.project.number}@firebase-rules.iam.gserviceaccount.com"
  
  depends_on = [
    google_firebase_project.default,
    google_project_service.required_apis
  ]
}
"""
            },
            
            "deployment_script_changes": """
# Update deployment script to handle Firebase-specific initialization

def initialize_firebase_project(project_id):
    '''Initialize Firebase project before Terraform'''
    print("STATUS: INITIALIZING_FIREBASE")
    
    # Check if Firebase is already initialized
    check_cmd = f"gcloud firebase projects describe {project_id} 2>/dev/null"
    result = subprocess.run(check_cmd, shell=True, capture_output=True)
    
    if result.returncode != 0:
        # Initialize Firebase
        init_cmd = f"gcloud firebase projects create {project_id} --project {project_id}"
        subprocess.run(init_cmd, shell=True, check=True)
        time.sleep(10)  # Wait for Firebase initialization
    
    return True
""",
            
            "ui_changes": """
// Add to the deployment form in dashboard

<div className="mb-4">
  <label className="block text-sm font-medium mb-2">
    Storage Location
  </label>
  <select
    value={formData.storage_location || 'US'}
    onChange={(e) => setFormData({...formData, storage_location: e.target.value})}
    className="w-full p-2 border rounded"
  >
    <option value="US">US (Multi-region)</option>
    <option value="EU">EU (Multi-region)</option>
    <option value="ASIA">Asia (Multi-region)</option>
    <option value="us-central1">US Central 1</option>
    <option value="us-east1">US East 1</option>
    <option value="europe-west1">Europe West 1</option>
    <option value="asia-southeast1">Asia Southeast 1</option>
  </select>
  <p className="text-xs text-gray-600 mt-1">
    Choose multi-region for better availability and performance
  </p>
</div>

<div className="mb-4">
  <label className="flex items-center">
    <input
      type="checkbox"
      checked={formData.enable_firebase_features !== false}
      onChange={(e) => setFormData({...formData, enable_firebase_features: e.target.checked})}
      className="mr-2"
    />
    <span className="text-sm font-medium">Enable Firebase Features</span>
  </label>
  <p className="text-xs text-gray-600 mt-1">
    Includes Firebase Storage, Firestore, and Authentication
  </p>
</div>
"""
        },
        
        "testing": {
            "validation_steps": [
                "Check if storage.googleapis.com API is enabled",
                "Check if firebasestorage.googleapis.com API is enabled", 
                "Verify Firebase project is initialized",
                "Check if default App Engine application exists (required for default bucket)",
                "Verify storage bucket is created with correct location",
                "Confirm bucket is accessible via Firebase SDK"
            ],
            
            "test_script": """
def validate_firebase_storage(project_id, storage_location):
    '''Validate Firebase storage is properly configured'''
    
    # Check APIs
    apis = ['storage.googleapis.com', 'firebasestorage.googleapis.com', 'firebase.googleapis.com']
    for api in apis:
        cmd = f"gcloud services list --filter='name:{api}' --format='value(name)' --project={project_id}"
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if api not in result.stdout:
            print(f"❌ API {api} is not enabled")
            return False
    
    # Check Firebase project
    cmd = f"gcloud firebase projects describe {project_id}"
    result = subprocess.run(cmd, shell=True, capture_output=True)
    if result.returncode != 0:
        print("❌ Firebase project not initialized")
        return False
    
    # Check storage bucket
    bucket_name = f"{project_id}.appspot.com"
    cmd = f"gsutil ls -b gs://{bucket_name}"
    result = subprocess.run(cmd, shell=True, capture_output=True)
    if result.returncode != 0:
        print(f"❌ Storage bucket {bucket_name} not found")
        return False
    
    print("✅ Firebase storage properly configured")
    return True
"""
        }
    }
    
    return fix

def main():
    print("🔧 Generating Firebase Storage Fix")
    print("=" * 60)
    
    fix = generate_firebase_storage_fix()
    
    # Save the complete fix
    with open("firebase_storage_complete_fix.json", "w") as f:
        json.dump(fix, f, indent=2)
    
    print("\n✅ Complete fix generated and saved to firebase_storage_complete_fix.json")
    
    # Generate implementation summary
    print("\n📋 IMPLEMENTATION SUMMARY:")
    print("-" * 60)
    print("\n1. UI CHANGES NEEDED:")
    print("   - Add storage location dropdown (US, EU, ASIA, or specific regions)")
    print("   - Add checkbox for enabling Firebase features")
    
    print("\n2. TERRAFORM MODULE CHANGES:")
    print("   - Create actual storage bucket before making it Firebase-accessible")
    print("   - Add App Engine application for default bucket")
    print("   - Add new variables for storage_location and enable_firebase_features")
    print("   - Add Firebase-specific APIs to required list")
    print("   - Add proper IAM permissions for Firebase service accounts")
    
    print("\n3. DEPLOYMENT PROCESS CHANGES:")
    print("   - Initialize Firebase project before running Terraform")
    print("   - Validate Firebase configuration after deployment")
    
    print("\n4. KEY FIXES:")
    print("   - Use google_storage_bucket to CREATE the bucket")
    print("   - Use google_firebase_storage_bucket to make it Firebase-accessible")
    print("   - Ensure App Engine is set up (required for default bucket)")
    print("   - Handle both multi-region and single-region storage options")
    
    print("\n🚀 Ready to implement these changes!")

if __name__ == "__main__":
    main()