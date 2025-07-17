#!/bin/bash

# Deployment validation script to ensure everything is configured correctly

echo "=== Anava Infrastructure Deployment Validation ==="
echo ""

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check function
check() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓${NC} $2"
        return 0
    else
        echo -e "${RED}✗${NC} $2"
        return 1
    fi
}

# Variables from terraform output
if [ -f "terraform-outputs.json" ]; then
    API_GATEWAY_URL=$(jq -r '.api_gateway_url.value' terraform-outputs.json)
    API_KEY=$(jq -r '.api_gateway_key.value' terraform-outputs.json)
    DEVICE_AUTH_URL=$(jq -r '.device_auth_url.value' terraform-outputs.json)
    TVM_URL=$(jq -r '.tvm_url.value' terraform-outputs.json)
else
    echo -e "${RED}Error: terraform-outputs.json not found${NC}"
    echo "Run: terraform output -json > terraform-outputs.json"
    exit 1
fi

echo "Configuration:"
echo "- API Gateway: $API_GATEWAY_URL"
echo "- Device Auth: $DEVICE_AUTH_URL"
echo "- TVM: $TVM_URL"
echo ""

# Test 1: Check if services are deployed
echo "1. Checking Cloud Run services..."
gcloud run services describe anava-device-auth-fn --region=us-central1 &>/dev/null
check $? "Device Auth service deployed"

gcloud run services describe anava-tvm-fn --region=us-central1 &>/dev/null
check $? "TVM service deployed"

# Test 2: Check IAM permissions
echo ""
echo "2. Checking IAM permissions..."
INVOKERS=$(gcloud run services get-iam-policy anava-device-auth-fn --region=us-central1 --format=json 2>/dev/null | jq -r '.bindings[]?.members[]?' | grep serviceAccount || echo "none")
if [ "$INVOKERS" != "none" ]; then
    check 0 "Device Auth has IAM invokers"
else
    check 1 "Device Auth has IAM invokers"
fi

# Test 3: Check API Gateway
echo ""
echo "3. Checking API Gateway..."
gcloud api-gateway gateways describe anava-gateway --location=us-central1 &>/dev/null
check $? "API Gateway exists"

# Test 4: Check managed service
echo ""
echo "4. Checking managed service..."
MANAGED_SERVICE=$(gcloud api-gateway gateways describe anava-gateway --location=us-central1 --format='value(managedService)' 2>/dev/null)
if [ ! -z "$MANAGED_SERVICE" ]; then
    gcloud services list --enabled | grep -q "$MANAGED_SERVICE"
    check $? "Managed service enabled: $MANAGED_SERVICE"
else
    check 1 "Managed service configured"
fi

# Test 5: Test API Gateway endpoint
echo ""
echo "5. Testing API Gateway endpoint..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "$API_GATEWAY_URL/device-auth/initiate" \
    -H "x-api-key: $API_KEY" \
    -H "Content-Type: application/json" \
    -d '{"device_id": "test-device"}')

if [ "$HTTP_CODE" = "200" ]; then
    check 0 "API Gateway authentication working (HTTP $HTTP_CODE)"
else
    check 1 "API Gateway authentication working (HTTP $HTTP_CODE)"
fi

# Test 6: Validate OpenAPI config
echo ""
echo "6. Checking API configuration..."
CONFIG_ID=$(gcloud api-gateway gateways describe anava-gateway --location=us-central1 --format='value(apiConfig)' 2>/dev/null | awk -F'/' '{print $NF}')
if [ ! -z "$CONFIG_ID" ]; then
    check 0 "API config exists: $CONFIG_ID"
else
    check 1 "API config exists"
fi

echo ""
echo "=== Summary ==="
echo ""
echo "If any checks failed, run these commands:"
echo ""
echo "1. Enable managed service:"
echo "   gcloud services enable <managed-service-name>"
echo ""
echo "2. Grant IAM permissions:"
echo "   gcloud run services add-iam-policy-binding anava-device-auth-fn \\"
echo "     --member='serviceAccount:anava-apigw-invoker-sa@PROJECT_ID.iam.gserviceaccount.com' \\"
echo "     --role='roles/run.invoker' --region=us-central1"
echo ""
echo "3. Update API Gateway config:"
echo "   Deploy the OpenAPI spec with correct backend URLs"