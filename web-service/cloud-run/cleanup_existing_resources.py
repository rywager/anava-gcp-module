#!/usr/bin/env python3
"""
Script to clean up existing Anava resources before deployment.
This handles the case where resources already exist and would cause conflicts.
"""

import subprocess
import sys
import json
import os

def run_gcloud_command(command):
    """Run a gcloud command and return the result."""
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            check=False
        )
        return result.returncode == 0, result.stdout.strip(), result.stderr.strip()
    except Exception as e:
        return False, "", str(e)

def cleanup_resources(project_id, solution_prefix="anava"):
    """Clean up existing Anava resources."""
    
    print(f"🧹 Cleaning up existing {solution_prefix} resources in project {project_id}...")
    
    # List of resources to clean up
    resources_to_cleanup = [
        {
            "name": "Service Accounts",
            "commands": [
                f"gcloud iam service-accounts delete {solution_prefix}-device-auth-sa@{project_id}.iam.gserviceaccount.com --project={project_id} --quiet",
                f"gcloud iam service-accounts delete {solution_prefix}-tvm-sa@{project_id}.iam.gserviceaccount.com --project={project_id} --quiet",
                f"gcloud iam service-accounts delete {solution_prefix}-vertex-ai-sa@{project_id}.iam.gserviceaccount.com --project={project_id} --quiet",
                f"gcloud iam service-accounts delete {solution_prefix}-apigw-invoker-sa@{project_id}.iam.gserviceaccount.com --project={project_id} --quiet"
            ]
        },
        {
            "name": "Cloud Functions",
            "commands": [
                f"gcloud functions delete {solution_prefix}-device-auth-fn --region=us-central1 --project={project_id} --quiet",
                f"gcloud functions delete {solution_prefix}-tvm-fn --region=us-central1 --project={project_id} --quiet"
            ]
        },
        {
            "name": "API Gateway",
            "commands": [
                f"gcloud api-gateway gateways delete {solution_prefix}-gateway --location=us-central1 --project={project_id} --quiet",
                f"gcloud api-gateway api-configs delete {solution_prefix}-config --api={solution_prefix}-api --project={project_id} --quiet",
                f"gcloud api-gateway apis delete {solution_prefix}-api --project={project_id} --quiet"
            ]
        },
        {
            "name": "Storage Buckets",
            "commands": [
                f"gsutil -m rm -rf gs://{project_id}-{solution_prefix}-functions || true",
                f"gsutil rb gs://{project_id}-{solution_prefix}-functions || true"
            ]
        },
        {
            "name": "Firestore Database",
            "commands": [
                f"gcloud firestore databases delete --database=(default) --project={project_id} --quiet || true"
            ]
        }
    ]
    
    cleanup_results = {}
    
    for resource_group in resources_to_cleanup:
        print(f"\n🔍 Cleaning up {resource_group['name']}...")
        cleanup_results[resource_group['name']] = []
        
        for command in resource_group['commands']:
            print(f"  Running: {command}")
            success, stdout, stderr = run_gcloud_command(command)
            
            if success:
                print(f"  ✅ Success")
                cleanup_results[resource_group['name']].append({"command": command, "success": True})
            else:
                if "not found" in stderr.lower() or "does not exist" in stderr.lower():
                    print(f"  ℹ️  Resource not found (already cleaned up)")
                    cleanup_results[resource_group['name']].append({"command": command, "success": True, "note": "not found"})
                else:
                    print(f"  ⚠️  Failed: {stderr}")
                    cleanup_results[resource_group['name']].append({"command": command, "success": False, "error": stderr})
    
    print(f"\n🎉 Cleanup completed for project {project_id}")
    print("You can now run a fresh deployment.")
    
    return cleanup_results

def main():
    if len(sys.argv) != 2:
        print("Usage: python cleanup_existing_resources.py <project_id>")
        print("Example: python cleanup_existing_resources.py my-gcp-project")
        sys.exit(1)
    
    project_id = sys.argv[1]
    solution_prefix = "anava"
    
    # Verify gcloud is authenticated
    success, stdout, stderr = run_gcloud_command("gcloud auth list --filter=status:ACTIVE --format='value(account)'")
    if not success or not stdout:
        print("❌ Error: gcloud is not authenticated. Please run 'gcloud auth login' first.")
        sys.exit(1)
    
    print(f"🔑 Authenticated as: {stdout}")
    
    # Verify project exists and is accessible
    success, stdout, stderr = run_gcloud_command(f"gcloud projects describe {project_id} --format='value(projectId)'")
    if not success:
        print(f"❌ Error: Cannot access project {project_id}. Please check the project ID and your permissions.")
        sys.exit(1)
    
    print(f"✅ Project {project_id} is accessible")
    
    # Ask for confirmation
    response = input(f"\n⚠️  This will DELETE existing {solution_prefix} resources in project {project_id}. Are you sure? (yes/no): ")
    if response.lower() != 'yes':
        print("❌ Cleanup cancelled.")
        sys.exit(0)
    
    # Perform cleanup
    cleanup_results = cleanup_resources(project_id, solution_prefix)
    
    # Print summary
    print("\n📊 Cleanup Summary:")
    for resource_group, results in cleanup_results.items():
        successful = sum(1 for r in results if r['success'])
        total = len(results)
        print(f"  {resource_group}: {successful}/{total} operations successful")

if __name__ == "__main__":
    main()