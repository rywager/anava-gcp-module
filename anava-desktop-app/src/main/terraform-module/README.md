# Anava GCP Terraform Module

This Terraform module creates the complete infrastructure for Anava ACAP cloud backend, based on the original `vertexSetup_gcp.sh` script.

## Features

- **Firebase Integration**:
  - Firebase project setup
  - Firestore database named "anava" with security rules
  - Firebase Storage bucket with security rules
  - Firebase Web App for client authentication

- **Cloud Functions**:
  - Device Authentication function (`device-auth`)
  - Token Vending Machine function (`token-vending-machine`)

- **API Gateway**:
  - Secure API endpoints with API key authentication
  - OpenAPI specification for device authentication and token exchange

- **Service Accounts & IAM**:
  - Dedicated service accounts for each component
  - Properly scoped IAM permissions

- **Workload Identity Federation**:
  - Firebase authentication to GCP token exchange
  - Secure impersonation of Vertex AI service account

- **Secret Manager**:
  - Firebase configuration storage
  - API key storage

## Usage

```hcl
module "anava" {
  source = "./terraform-anava-module"
  
  project_id            = "your-project-id"
  region               = "us-central1"
  solution_prefix      = "anava"
  firestore_location   = "nam5"
  firebase_web_app_name = "Anava Device Manager"
}
```

## Prerequisites

1. A GCP project with billing enabled
2. Terraform >= 1.5.0
3. The following APIs must be enabled (the module will enable them):
   - Firebase
   - Firestore
   - Cloud Functions
   - API Gateway
   - Secret Manager
   - Workload Identity Federation
   - And others...

## Outputs

- `api_gateway_url` - The URL of the deployed API Gateway
- `api_key` - The API key for accessing the API Gateway (sensitive)
- `firebase_config` - Firebase configuration for client applications (sensitive)
- `vertex_ai_service_account_email` - Email of the Vertex AI service account
- `firebase_storage_bucket` - Firebase Storage bucket name
- `firestore_database_id` - Firestore database ID

## API Endpoints

### Device Authentication
- **POST** `{api_gateway_url}/device-auth/initiate`
- Request body: `{"device_id": "your-device-id"}`
- Response: `{"firebase_custom_token": "..."}`

### Token Exchange
- **POST** `{api_gateway_url}/gcp-token/vend`
- Request body: `{"firebase_id_token": "your-firebase-id-token"}`
- Response: `{"gcp_access_token": "...", "expires_in": 3600}`

## Security

- All Cloud Functions are private (no public access)
- API Gateway requires API key authentication
- Firestore rules enforce device-based access control
- Storage rules require Firebase authentication
- Service accounts follow principle of least privilege

## Module Structure

```
terraform-anava-module/
├── main.tf                           # Main Terraform configuration
├── variables.tf                      # Input variables
├── outputs.tf                        # Output values
├── functions/
│   ├── device-auth/
│   │   ├── main.py                  # Device auth function code
│   │   └── requirements.txt         # Python dependencies
│   └── token-vending-machine/
│       ├── main.py                  # TVM function code
│       └── requirements.txt         # Python dependencies
├── templates/
│   └── openapi.yaml.tpl             # OpenAPI spec template
└── rules/
    ├── firestore.rules              # Firestore security rules
    └── storage.rules                # Firebase Storage rules
```