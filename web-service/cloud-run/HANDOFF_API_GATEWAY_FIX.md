# CRITICAL HANDOFF: API Gateway URL Fix

## Current Status
- **Version**: v2.3.38 (ready to deploy)
- **Issue**: API Gateway URL showing "Not found" in deployment outputs
- **Root Cause**: Terraform module was constructing a fake URL instead of using the actual URL from GCP
- **Fix Applied**: Modified Terraform outputs to use `default_hostname` attribute directly

## Changes Made

### 1. Fixed Terraform Module Output
**File**: `/Users/ryanwager/terraform-installer/web-service/cloud-run/terraform-anava-module/outputs.tf`
**Line 3 changed from**:
```terraform
value = "https://${google_api_gateway_gateway.anava_gateway.gateway_id}-${random_id.api_suffix.hex}.apigateway.${var.region}.run.app"
```
**To**:
```terraform
value = "https://${google_api_gateway_gateway.anava_gateway.default_hostname}"
```

### 2. Removed Discovery Logic
**File**: `/Users/ryanwager/terraform-installer/web-service/cloud-run/main.py`
- Removed lines 1117-1185 (68 lines of API Gateway discovery code)
- This code was trying to "discover" the URL with gcloud commands after deployment
- No longer needed since Terraform now provides the actual URL

### 3. Updated Version
**File**: `/Users/ryanwager/terraform-installer/web-service/cloud-run/main.py`
- Line 31: Updated VERSION to "2.3.38"

## Why This Fix Works

The fundamental problem was a **race condition**:
1. Terraform would create the API Gateway
2. Terraform would output a manually-constructed URL that didn't match reality
3. Python code would try to "discover" the real URL with gcloud commands
4. The discovery would fail because GCP hadn't fully provisioned the gateway yet

The fix eliminates the race condition entirely:
- `google_api_gateway_gateway.default_hostname` is an attribute that Terraform waits for
- Terraform won't complete until GCP provides the actual hostname
- No discovery needed - the URL comes directly from Terraform state

## Deployment Commands

From directory: `/Users/ryanwager/terraform-installer/web-service/cloud-run`

```bash
# 1. Commit the changes
git add -A
git commit -m "v2.3.38: Fix API Gateway URL - use Terraform output directly"

# 2. Build the Docker image
gcloud builds submit --tag gcr.io/anava-ai/anava-deploy:v2.3.38 --timeout=1200s

# 3. Wait for build to complete, then deploy
gcloud run deploy anava-deploy --image gcr.io/anava-ai/anava-deploy:v2.3.38 --region us-central1 --platform managed
```

## Test Instructions

1. Deploy v2.3.38 using the commands above
2. Start a new deployment through the web interface
3. Monitor the deployment logs
4. When deployment completes, check that `apiGatewayUrl` has a real URL (not "Not found")

## Expected Result

The deployment output should now include:
```json
{
  "apiGatewayUrl": "https://[actual-gateway-id].apigateway.[region].run.app",
  "apiKey": "[actual-api-key]",
  ...
}
```

## If This Still Fails

The only remaining possibilities would be:
1. The Terraform module isn't creating the API Gateway properly
2. The `default_hostname` attribute isn't available in the version of the GCP provider being used
3. There's an issue with how the module is being called from the root configuration

To debug further, check:
- Terraform logs during the apply phase
- Whether the API Gateway is actually being created in GCP
- The Terraform state file to see what attributes are available

## Next Session Prompt

If you need to start a new session, use this prompt:

```
I'm working on fixing a Terraform deployment system where the API Gateway URL shows "Not found". 

Current status:
- Version v2.3.38 has been prepared but not deployed
- The fix changes terraform-anava-module/outputs.tf line 3 to use google_api_gateway_gateway.anava_gateway.default_hostname
- The discovery logic has been removed from main.py (lines 1117-1185 deleted)
- I need to deploy this version and test if it fixes the issue

The handoff document is at: /Users/ryanwager/terraform-installer/web-service/cloud-run/HANDOFF_API_GATEWAY_FIX.md

Please help me:
1. Deploy v2.3.38 
2. Monitor a test deployment
3. Verify the API Gateway URL is now correctly output
```