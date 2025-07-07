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
Build a complete, production-grade Terraform module that replaces the brittle `vertexSetup_gcp.sh` script with a secure, idempotent Infrastructure as Code solution. **CRITICAL: Use automated testing throughout - no manual UAT required.**

## Testing-First Approach
Read `AUTOMATED_TESTING_STRATEGY.md` - you will build this with comprehensive automated testing so you can iterate without manual testing. Set up the testing framework FIRST, then build the module with continuous automated validation.

## Immediate Actions Required

### 1. Set Up Testing Framework FIRST
```bash
# Create test structure
mkdir -p tests/{unit,integration,e2e,fixtures,scripts}
# Set up test projects and automation
# Follow AUTOMATED_TESTING_STRATEGY.md
```

### 2. Analyze the Original Script
- Read and analyze `vertexSetup_gcp.sh` thoroughly
- Extract all GCP resources being created
- Identify all API enablements
- Map out service accounts and IAM roles
- Document Cloud Functions and their purposes
- Note Firebase/Firestore configurations

### 3. Implement with Test-Driven Development
**Priority Order (with testing at each step):**

#### Phase 2: Foundational Resources + Unit Tests
1. Create unit tests for variables, locals, IAM
2. `variables.tf` - Define project_id, region, solution_prefix
3. `locals.tf` - Create consistent naming scheme
4. `main.tf` - Add provider and enable required APIs
5. `iam.tf` - Create service accounts and custom IAM roles
6. **Test**: Run unit tests, validate, plan

#### Phase 3: Application Infrastructure + Integration Tests
1. Create integration tests for functions and API Gateway
2. `functions/` - Create the Python Cloud Functions
3. `functions.tf` - Deploy functions with proper configuration
4. `api_gateway.tf` - Create API Gateway with OpenAPI spec
5. **Test**: Deploy to test project, run integration tests

#### Phase 4: Data & Security + Security Tests
1. Create security validation tests
2. `firebase.tf` - Set up Firestore and security rules
3. `files/` - Create firestore.rules and storage.rules
4. Complete API key management with Secret Manager
5. `outputs.tf` - Define required outputs
6. **Test**: Run security tests, validate permissions

#### Phase 5: E2E Testing + Documentation
1. Create end-to-end customer journey tests
2. `README.md` - Comprehensive module documentation
3. `examples/basic_usage/` - Working example
4. Create separate customer-facing repository
5. **Test**: Run full E2E tests, validate customer experience

## Key Principles to Follow

### Security First
- Use principle of least privilege for all IAM roles
- Store all secrets in Google Secret Manager
- Never expose API keys in outputs - only secret names
- Create custom IAM roles, not predefined ones

### Testing-First Development
- Set up tests BEFORE implementing features
- Run tests continuously during development
- Use automated validation instead of manual testing
- Iterate based on test results, not manual verification

### Idempotency
- All resources must be safely re-runnable
- Handle resource conflicts gracefully
- Use proper Terraform state management
- Validate idempotency through automated tests

### Maintainability
- Use locals for consistent naming
- Add comments where necessary
- Follow Terraform best practices
- Organize code logically
- Maintain comprehensive test suite

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

## Success Criteria (All Automated)
- **Automated Testing**: Complete test suite passes (unit, integration, E2E, security)
- **Deployment Success**: >98% success rate measured by automated tests
- **Performance**: <15 minutes deployment time validated automatically
- **Security**: All security tests pass, no manual security review needed
- **Functionality**: All API endpoints tested and working via automation
- **Customer Experience**: E2E tests simulate and validate customer journey
- **Zero Manual Testing**: Complete confidence without manual UAT

## Files to Focus On
1. `vertexSetup_gcp.sh` - Your source of truth for what to build
2. `anava-gcp-module/` - Your implementation target
3. `PRD.md` - Your requirements specification

## Start Command
Begin by setting up the testing framework, then analyze the script and implement with continuous testing.

**First commands to run:**
```bash
# 1. Read the testing strategy
cat AUTOMATED_TESTING_STRATEGY.md

# 2. Set up testing framework
mkdir -p tests/{unit,integration,e2e,fixtures,scripts}

# 3. Analyze the original script
head -100 vertexSetup_gcp.sh
```

Then follow the testing-first approach: test → implement → test → iterate.

## Remember
- This is a production-grade solution that will be used by customers
- Security is paramount - use least privilege everywhere
- Make it idempotent - customers should be able to run it multiple times
- Document everything clearly for the "IT Ian" persona
- Test thoroughly before considering it complete