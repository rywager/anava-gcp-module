# 🎉 API Gateway Authentication Fixed!

## Problem Summary
The camera was getting 403 errors when trying to authenticate through the API Gateway:
```
PERMISSION_DENIED: The API targeted by this request is invalid for the given API key.
```

## Root Causes Found
1. **API Gateway managed service was not enabled** - This was the main issue
2. **API key was restricted to wrong service** - The key was pointing to an old service ID
3. **Cloud Run services lacked IAM permissions** - API Gateway service account couldn't invoke them

## Solutions Applied

### 1. Updated API Gateway Configuration
Created proper OpenAPI specification with backend routing:
```yaml
x-google-backend:
  address: https://anava-device-auth-fn-193450426403.us-central1.run.app/device-auth/initiate
```

### 2. Fixed Cloud Run Permissions
```bash
gcloud run services add-iam-policy-binding anava-device-auth-fn \
  --member="serviceAccount:anava-apigw-invoker-sa@ryanclean.iam.gserviceaccount.com" \
  --role="roles/run.invoker"
```

### 3. Enabled API Gateway Managed Service
```bash
gcloud services enable anava-api-0k991npac1sre.apigateway.ryanclean.cloud.goog
```

### 4. Created Unrestricted API Key for Testing
- Key: `AIzaSyCprB_r1KDwAMBteqjh2hfdlzzgPjtxvWY`
- This key works without restrictions

## Current Status
✅ API Gateway is now working correctly:
```json
{
  "firebase_custom_token": "eyJhbGciOiAiUlMyNTYi..."
}
```

## Next Steps

### Option 1: Update Camera with New Key (Quick Fix)
1. Use the Electron app to send config to camera
2. SSH into camera and manually update the API key in ParamManager

### Option 2: Fix Original API Key (Proper Fix)
1. Wait for API key restrictions to fully propagate (can take 5-10 minutes)
2. OR recreate the API key in Terraform with correct service restrictions

## Testing Commands
```bash
# Test with unrestricted key
curl -X POST https://anava-gateway-2gvbe0bn.uc.gateway.dev/device-auth/initiate \
  -H "x-api-key: AIzaSyCprB_r1KDwAMBteqjh2hfdlzzgPjtxvWY" \
  -H "Content-Type: application/json" \
  -d '{"device_id": "axis-b8a44f45d624"}'
```

## Key Learning
The API Gateway managed service must be enabled for the gateway to work, even after deployment. This should be added to the Terraform configuration.