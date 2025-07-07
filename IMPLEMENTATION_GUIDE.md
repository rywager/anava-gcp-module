# Anava Secure Cloud Installer - Implementation Guide

## Overview
This document provides a comprehensive guide for implementing the Anava Secure Cloud Installer based on the PRD requirements and analysis of the existing `vertexSetup_gcp.sh` script.

## Project Structure
```
terraform-installer/
├── PRD.md                           # Product Requirements Document
├── vertexSetup_gcp.sh              # Original script to analyze
├── IMPLEMENTATION_GUIDE.md         # This file
├── NEXT_SESSION_PROMPT.md          # Prompt for implementation session
└── anava-gcp-module/               # Terraform module directory
    ├── main.tf                     # Main Terraform configuration
    ├── variables.tf                # Input variables
    ├── outputs.tf                  # Module outputs
    ├── locals.tf                   # Local values and naming
    ├── iam.tf                      # IAM roles and service accounts
    ├── functions.tf                # Cloud Functions
    ├── api_gateway.tf              # API Gateway configuration
    ├── firebase.tf                 # Firebase/Firestore setup
    ├── README.md                   # Module documentation
    ├── examples/
    │   └── basic_usage/
    │       ├── main.tf
    │       └── outputs.tf
    ├── functions/
    │   ├── device-auth/
    │   │   ├── main.py
    │   │   └── requirements.txt
    │   └── token-vending-machine/
    │       ├── main.py
    │       └── requirements.txt
    └── files/
        ├── firestore.rules
        └── storage.rules
```

## Implementation Phases

### Phase 1: Project Scaffolding ✅
- [x] Create directory structure
- [x] Create placeholder files
- [x] Copy original script for analysis

### Phase 2: Script Analysis & Architecture Design
**Key Components from vertexSetup_gcp.sh:**
- Google Cloud APIs to enable
- Service accounts and IAM roles
- Cloud Functions (device-auth, token-vending-machine)
- API Gateway configuration
- Firebase/Firestore setup
- Security rules
- Secret management

### Phase 3: Terraform Module Development
**Core Files to Implement:**
1. `variables.tf` - Input variables (project_id, region, solution_prefix)
2. `locals.tf` - Consistent naming conventions
3. `main.tf` - Provider configuration and API enablement
4. `iam.tf` - Service accounts and custom IAM roles
5. `functions.tf` - Cloud Functions deployment
6. `api_gateway.tf` - API Gateway with OpenAPI spec
7. `firebase.tf` - Firestore database and security rules
8. `outputs.tf` - Required outputs for customers

### Phase 4: Function Implementation
**Cloud Functions to Create:**
- Device authentication function
- Token vending machine function
- Proper requirements.txt files
- Error handling and logging

### Phase 5: Security & Rules
- Firestore security rules
- Storage security rules
- API key management via Secret Manager
- Principle of least privilege IAM

### Phase 6: Documentation & Examples
- Comprehensive README.md
- Basic usage example
- Customer-facing repository setup

## Key Requirements Analysis

### Required GCP APIs
Based on the script analysis, these APIs need to be enabled:
- Cloud Functions API
- API Gateway API
- Firestore API
- Firebase API
- Secret Manager API
- Cloud Storage API
- IAM API

### Service Accounts Required
1. Cloud Functions execution service account
2. API Gateway service account
3. Firestore service account
4. Firebase service account

### Security Considerations
- All service accounts use custom IAM roles (principle of least privilege)
- API keys stored in Secret Manager
- Firestore security rules enforced
- Storage security rules enforced

### Customer Experience
- One-click "Deploy to Cloud Shell" button
- Clear tutorial in README
- Simple terraform init && terraform apply workflow
- Clear output of API Gateway URL and secret names

## Success Metrics
- >98% deployment success rate
- <15 minutes deployment time
- Comprehensive documentation
- Full idempotency

## Next Steps
1. Analyze the vertexSetup_gcp.sh script in detail
2. Extract all GCP resources and configurations
3. Implement each Terraform file systematically
4. Test the complete deployment
5. Create customer-facing repository
6. Write comprehensive documentation

## Notes for Implementation Session
- The vertexSetup_gcp.sh script is the source of truth for what resources need to be created
- Focus on security-first approach with custom IAM roles
- Ensure full idempotency for all resources
- Test thoroughly before creating customer-facing repo