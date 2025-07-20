#!/bin/bash

# Test with unrestricted API key

API_GATEWAY_URL="https://anava-gateway-2gvbe0bn.uc.gateway.dev"
API_KEY="AIzaSyCprB_r1KDwAMBteqjh2hfdlzzgPjtxvWY"  # New unrestricted key
DEVICE_ID="axis-b8a44f45d624"

echo "=== Testing with Unrestricted API Key ==="
echo "API Gateway URL: $API_GATEWAY_URL"
echo "API Key: ${API_KEY:0:10}...${API_KEY: -4}"
echo ""

# Test device auth endpoint
echo "Testing /device-auth/initiate endpoint..."
REQUEST_BODY="{\"device_id\": \"$DEVICE_ID\"}"

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

if [ "$HTTP_CODE" = "200" ]; then
  echo "✅ Success! The API Gateway is working correctly."
  echo ""
  echo "Next steps:"
  echo "1. The restricted API key issue needs to be fixed in Terraform"
  echo "2. Update the camera configuration with this new key temporarily"
  echo "3. Or fix the managed service configuration in the API Gateway"
elif [ "$HTTP_CODE" = "403" ]; then
  echo "❌ Still getting 403 with unrestricted key"
  echo "This suggests the API Gateway itself has issues"
else
  echo "❌ Unexpected response: $HTTP_CODE"
fi