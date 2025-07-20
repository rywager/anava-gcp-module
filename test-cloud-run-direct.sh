#!/bin/bash

# Test Cloud Run services directly (bypassing API Gateway)

DEVICE_AUTH_URL="https://anava-device-auth-fn-6hvyxxvgsa-uc.a.run.app"
TVM_URL="https://anava-tvm-fn-6hvyxxvgsa-uc.a.run.app"
DEVICE_ID="axis-b8a44f45d624"

echo "=== Testing Cloud Run Services Directly ==="
echo ""

# Test 1: Device Auth Service
echo "1. Testing Device Auth Service..."
echo "URL: $DEVICE_AUTH_URL"
echo ""

# Check if service is reachable
echo "Checking service health..."
curl -s -o /dev/null -w "HTTP Code: %{http_code}\n" "$DEVICE_AUTH_URL/"
echo ""

# Try the actual device auth endpoint
echo "Testing device auth initiate..."
REQUEST_BODY="{\"device_id\": \"$DEVICE_ID\"}"
echo "Request: POST $DEVICE_AUTH_URL/device-auth/initiate"
echo "Body: $REQUEST_BODY"

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY" \
  "$DEVICE_AUTH_URL/device-auth/initiate")

HTTP_CODE=$(echo "$RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

echo "Response Code: $HTTP_CODE"
echo "Response Body:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY" | head -10
echo ""

# Test 2: TVM Service
echo "2. Testing TVM (Token Vending Machine) Service..."
echo "URL: $TVM_URL"
echo ""

# Check if service is reachable
echo "Checking service health..."
curl -s -o /dev/null -w "HTTP Code: %{http_code}\n" "$TVM_URL/"
echo ""

# Try token exchange (this will fail without valid Firebase token, but shows if endpoint exists)
echo "Testing token exchange endpoint..."
FIREBASE_TOKEN="dummy-token-for-testing"
REQUEST_BODY="{\"firebase_token\": \"$FIREBASE_TOKEN\"}"
echo "Request: POST $TVM_URL/token/exchange"

RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" \
  -X POST \
  -H "Content-Type: application/json" \
  -d "$REQUEST_BODY" \
  "$TVM_URL/token/exchange")

HTTP_CODE=$(echo "$RESPONSE" | grep -o "HTTP_CODE:[0-9]*" | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '/HTTP_CODE:/d')

echo "Response Code: $HTTP_CODE"
echo "Response Body:"
echo "$BODY" | jq . 2>/dev/null || echo "$BODY" | head -10
echo ""

echo "=== Analysis ==="
echo "The Cloud Run services are deployed at:"
echo "- Device Auth: $DEVICE_AUTH_URL"
echo "- TVM: $TVM_URL"
echo ""
echo "But the API Gateway at https://anava-gateway-2gvbe0bn.uc.gateway.dev"
echo "is not properly configured to route requests to these services."
echo ""
echo "The API Gateway needs an OpenAPI specification that defines:"
echo "1. The /device-auth/* paths"
echo "2. The /token/* paths"
echo "3. x-google-backend configurations pointing to the Cloud Run URLs"
echo ""
echo "Without this configuration, the API Gateway returns 403 errors."