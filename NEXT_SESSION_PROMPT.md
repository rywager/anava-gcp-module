# Next Session Implementation Prompt

## Context
You are continuing work on the Anava Secure Cloud Installer project. All planning and scaffolding is complete. The directory structure is set up with placeholder files, and you have the original `vertexSetup_gcp.sh` script to analyze.

## Current State
- ✅ PRD.md reviewed and understood
- ✅ Directory structure created (`anava-gcp-module/` with all placeholder files)
- ✅ Original script `vertexSetup_gcp.sh` copied to project root
- ✅ Implementation guide created
- ⏳ Ready for full implementation

## Your Mission
Build a complete, production-grade Terraform module that replaces the brittle `vertexSetup_gcp.sh` script with a secure, idempotent Infrastructure as Code solution.

## Immediate Actions Required

### 1. First - Initialize Git Repository
```bash
git init
git add .
git commit -m "Initial project setup with PRD and planning documents"
```

### 2. Analyze the Original Script
- Read and analyze `vertexSetup_gcp.sh` thoroughly
- Extract all GCP resources being created
- Identify all API enablements
- Map out service accounts and IAM roles
- Document Cloud Functions and their purposes
- Note Firebase/Firestore configurations

### 3. Implement Phase 2: Foundational Resources
**Priority Order:**
1. `variables.tf` - Define project_id, region, solution_prefix
2. `locals.tf` - Create consistent naming scheme
3. `main.tf` - Add provider and enable required APIs
4. `iam.tf` - Create service accounts and custom IAM roles

### 4. Implement Phase 3: Application Infrastructure
1. `functions/` - Create the Python Cloud Functions
2. `functions.tf` - Deploy functions with proper configuration
3. `api_gateway.tf` - Create API Gateway with OpenAPI spec

### 5. Implement Phase 4: Data & Security
1. `firebase.tf` - Set up Firestore and security rules
2. `files/` - Create firestore.rules and storage.rules
3. Complete API key management with Secret Manager
4. `outputs.tf` - Define required outputs

### 6. Implement Phase 5: Documentation & Examples
1. `README.md` - Comprehensive module documentation
2. `examples/basic_usage/` - Working example
3. Create separate customer-facing repository

## Key Principles to Follow

### Security First
- Use principle of least privilege for all IAM roles
- Store all secrets in Google Secret Manager
- Never expose API keys in outputs - only secret names
- Create custom IAM roles, not predefined ones

### Idempotency
- All resources must be safely re-runnable
- Handle resource conflicts gracefully
- Use proper Terraform state management

### Maintainability
- Use locals for consistent naming
- Add comments where necessary
- Follow Terraform best practices
- Organize code logically

## Expected Deliverables

### 1. Complete Terraform Module
- All 8 core .tf files fully implemented
- Working Cloud Functions with proper Python code
- Complete API Gateway with OpenAPI specification
- Firebase/Firestore with security rules
- Comprehensive outputs

### 2. Customer-Facing Repository
- Simple main.tf that uses the module
- Tutorial README.md for Cloud Shell experience
- "Deploy to Cloud Shell" button setup

### 3. Documentation
- Module README with all variables, outputs, resources
- Architecture diagram (if possible)
- Security considerations documented

## Success Criteria
- Module deploys successfully with `terraform apply`
- All resources created with proper IAM permissions
- API Gateway returns proper responses
- Firestore database accessible with security rules
- Secret Manager contains API key
- Customer can follow tutorial and deploy in <15 minutes

## Files to Focus On
1. `vertexSetup_gcp.sh` - Your source of truth for what to build
2. `anava-gcp-module/` - Your implementation target
3. `PRD.md` - Your requirements specification

## Start Command
Begin by analyzing the script and implementing the foundational resources. Work systematically through each phase, testing as you go.

**First command to run:**
```bash
# Initialize git and start analyzing the script
git init && git add . && git commit -m "Initial setup"
```

Then dive into `vertexSetup_gcp.sh` analysis and start implementing the Terraform module.

## Remember
- This is a production-grade solution that will be used by customers
- Security is paramount - use least privilege everywhere
- Make it idempotent - customers should be able to run it multiple times
- Document everything clearly for the "IT Ian" persona
- Test thoroughly before considering it complete