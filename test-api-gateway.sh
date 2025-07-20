#!/bin/bash

# Test API Gateway configuration for device authentication

# Configuration from your deployment
API_GATEWAY_URL="https://anava-gateway-2gvbe0bn.uc.gateway.dev"
API_KEY="AIzaSyD-ZAvCgXJR40dSsxOcgpDX9Yey0m4xAU4"
DEVICE_ID="axis-b8a44f45d624"  # From your logs

echo "=== Testing API Gateway Device Authentication ==="
echo "API Gateway URL: $API_GATEWAY_URL"
echo "API Key: ${API_KEY:0:10}...${API_KEY: -4}"
echo "Device ID: $DEVICE_ID"
echo ""

# Test 1: Basic connectivity to API Gateway
echo "1. Testing basic API Gateway connectivity..."
curl -s -o /dev/null -w "HTTP Code: %{http_code}\n" \
  -H "x-api-key: $API_KEY" \
  "$API_GATEWAY_URL/"
echo ""

# Test 2: List available endpoints
echo "2. Checking API Gateway endpoints..."
curl -s -X GET \
  -H "x-api-key: $API_KEY" \
  "$API_GATEWAY_URL/" | jq -r '.endpoints[]?' 2>/dev/null || echo "No endpoints list available"
echo ""

# Test 3: Device auth initiate endpoint
echo "3. Testing /device-auth/initiate endpoint..."
REQUEST_BODY="{\"device_id\": \"$DEVICE_ID\"}"
echo "Request body: $REQUEST_BODY"
echo "Full URL: $API_GATEWAY_URL/device-auth/initiate"
echo ""

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -X POST \
  -H "Content-Type: application/json; charset=utf-8" \
  -H "x-api-key: $API_KEY" \
  -d "$REQUEST_BODY" \
  "$API_GATEWAY_URL/device-auth/initiate")

HTTP_CODE=$(echo "$RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

echo "HTTP Response Code: $HTTP_CODE"
echo "Response Body:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY"
echo ""

# Test 4: Check if it's a path issue
if [ "$HTTP_CODE" = "403" ]; then
  echo "4. Debugging 403 error - checking alternate paths..."
  
  # Try without leading slash
  echo "Trying: device-auth/initiate (no leading slash)..."
  curl -s -w "\nHTTP Code: %{http_code}\n" \
    -X POST \
    -H "Content-Type: application/json; charset=utf-8" \
    -H "x-api-key: $API_KEY" \
    -d "$REQUEST_BODY" \
    "$API_GATEWAY_URL/device-auth/initiate" | head -5
  echo ""
  
  # Try with v1 prefix
  echo "Trying: /v1/device-auth/initiate..."
  curl -s -w "\nHTTP Code: %{http_code}\n" \
    -X POST \
    -H "Content-Type: application/json; charset=utf-8" \
    -H "x-api-key: $API_KEY" \
    -d "$REQUEST_BODY" \
    "$API_GATEWAY_URL/v1/device-auth/initiate" | head -5
  echo ""
  
  # Try as a query parameter
  echo "Trying: /device-auth?action=initiate..."
  curl -s -w "\nHTTP Code: %{http_code}\n" \
    -X POST \
    -H "Content-Type: application/json; charset=utf-8" \
    -H "x-api-key: $API_KEY" \
    -d "$REQUEST_BODY" \
    "$API_GATEWAY_URL/device-auth?action=initiate" | head -5
fi

echo ""
echo "=== Diagnosis ==="
if [ "$HTTP_CODE" = "403" ]; then
  echo "❌ Error 403: PERMISSION_DENIED"
  echo "Possible causes:"
  echo "1. The API key doesn't have access to the device-auth endpoints"
  echo "2. The API Gateway configuration is missing the device-auth backend"
  echo "3. The Cloud Function for device-auth is not deployed"
  echo "4. The API path mapping is incorrect"
elif [ "$HTTP_CODE" = "404" ]; then
  echo "❌ Error 404: NOT_FOUND"
  echo "The device-auth endpoint doesn't exist in the API Gateway configuration"
elif [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Success! The API Gateway is properly configured"
else
  echo "❌ Unexpected HTTP code: $HTTP_CODE"
fi

echo ""
echo "Next steps:"
echo "1. Check if the Cloud Functions are deployed:"
echo "   gcloud functions list --filter='name:device-auth OR name:tvm'"
echo ""
echo "2. Check API Gateway configuration:"
echo "   gcloud api-gateway gateways describe anava-gateway --location=us-central1"
echo ""
echo "3. Check API Gateway API config:"
echo "   gcloud api-gateway api-configs list --api=anava-api --format='value(name)' | head -1 | xargs gcloud api-gateway api-configs describe --api=anava-api"