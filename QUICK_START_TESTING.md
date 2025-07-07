# Quick Start Testing Guide

## Immediate Setup for Next Session

### 1. Test Directory Structure
```bash
mkdir -p tests/{unit,integration,e2e,fixtures,scripts}
```

### 2. Required Test Files to Create First
```
tests/
├── unit/
│   ├── terraform_validate_test.go
│   └── variables_test.go
├── integration/
│   ├── full_deployment_test.go
│   └── api_gateway_test.go
├── scripts/
│   ├── setup-test-env.sh
│   └── run-tests.sh
├── fixtures/
│   └── test-project-config.tfvars
└── Makefile
```

### 3. Test Configuration Requirements

#### You Need
- GCP test project ID (create one or use existing)
- Service account with appropriate permissions
- Billing account linked to test project

#### Test Project Setup
```bash
# Create test project
gcloud projects create anava-terraform-test-001

# Enable billing
gcloud beta billing projects link anava-terraform-test-001 --billing-account=YOUR_BILLING_ACCOUNT

# Create service account for testing
gcloud iam service-accounts create terraform-test-sa --project=anava-terraform-test-001

# Grant necessary permissions
gcloud projects add-iam-policy-binding anava-terraform-test-001 \
    --member="serviceAccount:terraform-test-sa@anava-terraform-test-001.iam.gserviceaccount.com" \
    --role="roles/editor"
```

### 4. Environment Variables for Testing
```bash
export TEST_PROJECT_ID="anava-terraform-test-001"
export TEST_REGION="us-central1"
export TEST_SOLUTION_PREFIX="test-anava"
export GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account-key.json"
```

### 5. Basic Test Execution Flow
```bash
# Run validation
make test-validate

# Run unit tests
make test-unit

# Run integration tests (deploys to test project)
make test-integration

# Run full suite
make test-all

# Clean up
make clean
```

### 6. Key Testing Principles
1. **Test First**: Write tests before implementing
2. **Continuous Testing**: Run tests after each change
3. **Automated Validation**: No manual verification needed
4. **Clean State**: Always clean up test resources
5. **Isolated Testing**: Each test should be independent

### 7. Test Success Metrics
- All tests pass (100% success rate)
- Deployment completes in <15 minutes
- All security validations pass
- All API endpoints respond correctly
- No manual intervention required

### 8. Failure Handling
- Tests automatically retry transient failures
- Clear error messages for debugging
- Automatic cleanup on test failure
- Sentry integration for error tracking

This setup enables complete automated testing without manual UAT requirements.