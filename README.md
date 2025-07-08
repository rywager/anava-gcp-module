# Anava GCP Terraform Module

This Terraform module creates the complete infrastructure for Anava ACAP cloud backend.

## Features

- Firebase project setup with Firestore
- Service accounts with proper IAM permissions
- Workload Identity Federation for external access
- Secret Manager for configuration storage
- API Gateway for secure API access

## Usage

```hcl
module "anava" {
  source = "git::https://github.com/rywager/anava-gcp-module.git?ref=master"
  
  project_id       = "your-project-id"
  region          = "us-central1"
  solution_prefix = "anava"
}
```

## Outputs

- `api_gateway_url` - The URL of the deployed API Gateway
- `firebase_config_secret_name` - Secret Manager secret containing Firebase config
- `firebase_api_key_secret_name` - Secret Manager secret containing API key
- `workload_identity_provider` - Workload Identity Federation provider
- `service_account_email` - Email of the created service account