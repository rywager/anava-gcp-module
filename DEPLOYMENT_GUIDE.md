# 🚀 Anava Infrastructure Deployment Guide

## Prerequisites
- Google Cloud account with billing enabled
- `gcloud` CLI installed and authenticated
- Terraform installed
- Node.js 18+ for Electron app

## Step 1: Deploy Infrastructure with Terraform

1. **Update Terraform configuration** with the fixes:
   - Copy `terraform-api-gateway-complete.tf` to your Terraform directory
   - Copy `api-gateway-openapi-template.yaml` to your Terraform directory
   - Ensure the API Gateway managed service is enabled in the configuration

2. **Deploy**:
   ```bash
   terraform init
   terraform plan
   terraform apply
   ```

3. **Export outputs**:
   ```bash
   terraform output -json > terraform-outputs.json
   ```

## Step 2: Validate Deployment

Run the validation script:
```bash
chmod +x validate-deployment.sh
./validate-deployment.sh
```

This will check:
- ✓ Cloud Run services are deployed
- ✓ IAM permissions are set
- ✓ API Gateway is configured
- ✓ Managed service is enabled
- ✓ Authentication is working

## Step 3: Configure Electron App

1. **Copy terraform outputs** to the Electron app:
   ```bash
   cp terraform-outputs.json anava-desktop-app/terraform-outputs-real.json
   ```

2. **Start the app**:
   ```bash
   cd anava-desktop-app
   npm install
   npm start
   ```

## Step 4: Send Configuration to Camera

1. Open the Electron app
2. Navigate to the "Configuration" tab
3. Click "Send to Camera"
4. Enter camera IP address
5. Configuration will be sent automatically

## Common Issues and Fixes

### Issue: API Gateway returns 403 "PERMISSION_DENIED"

**Cause**: Managed service not enabled or API key restrictions

**Fix**:
```bash
# Get the managed service name
MANAGED_SERVICE=$(gcloud api-gateway gateways describe anava-gateway \
  --location=us-central1 --format='value(managedService)')

# Enable it
gcloud services enable $MANAGED_SERVICE
```

### Issue: Cloud Run returns 403/401

**Cause**: Missing IAM permissions

**Fix**:
```bash
# Grant permissions
gcloud run services add-iam-policy-binding anava-device-auth-fn \
  --member='serviceAccount:anava-apigw-invoker-sa@PROJECT_ID.iam.gserviceaccount.com' \
  --role='roles/run.invoker' --region=us-central1
```

### Issue: Wrong Cloud Run URLs

**Cause**: Terraform outputs show generated URLs instead of actual ones

**Fix**: Use the updated Terraform configuration that outputs `status[0].url`

## Testing

Test the complete flow:
```bash
# Test API Gateway
curl -X POST https://YOUR-GATEWAY.uc.gateway.dev/device-auth/initiate \
  -H "x-api-key: YOUR-API-KEY" \
  -H "Content-Type: application/json" \
  -d '{"device_id": "test-device"}'
```

Expected response:
```json
{
  "firebase_custom_token": "eyJhbGciOi..."
}
```

## Key Configuration Changes Made

1. **Terraform**:
   - Added automatic managed service enablement
   - Created unrestricted API key (no service restrictions)
   - Fixed Cloud Run URL outputs
   - Added OpenAPI template with variable substitution

2. **Electron App**:
   - Added configuration logging
   - Improved error handling

3. **Validation**:
   - Created comprehensive deployment validation script
   - Added troubleshooting commands

## For New Projects

When deploying to a new Google Cloud project:

1. Ensure all APIs are enabled:
   ```bash
   gcloud services enable compute.googleapis.com
   gcloud services enable cloudresourcemanager.googleapis.com
   gcloud services enable apigateway.googleapis.com
   gcloud services enable servicemanagement.googleapis.com
   gcloud services enable servicecontrol.googleapis.com
   gcloud services enable run.googleapis.com
   ```

2. Use the updated Terraform configuration
3. Run the validation script after deployment
4. The system should work immediately without manual fixes