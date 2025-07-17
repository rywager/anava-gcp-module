#!/bin/bash

# Check Cloud Run services and test with authentication

PROJECT_ID="ryanclean"
DEVICE_AUTH_URL="https://anava-device-auth-fn-6hvyxxvgsa-uc.a.run.app"
TVM_URL="https://anava-tvm-fn-6hvyxxvgsa-uc.a.run.app"

echo "=== Checking Cloud Run Service Authentication ==="
echo ""

# Extract service names from URLs
DEVICE_AUTH_SERVICE=$(echo $DEVICE_AUTH_URL | sed -E 's/https:\/\/([^-]+(-[^-]+)*).*/\1/')
TVM_SERVICE=$(echo $TVM_URL | sed -E 's/https:\/\/([^-]+(-[^-]+)*).*/\1/')

echo "Device Auth Service: $DEVICE_AUTH_SERVICE"
echo "TVM Service: $TVM_SERVICE"
echo ""

# Test with authentication token
echo "Getting authentication token..."
TOKEN=$(gcloud auth print-access-token 2>/dev/null)

if [ -z "$TOKEN" ]; then
  echo "No authentication token available. The services might be:"
  echo "1. Configured to allow unauthenticated access (unlikely)"
  echo "2. Require service account authentication"
  echo "3. Only accessible through API Gateway"
else
  echo "Testing with authentication token..."
  echo ""
  
  echo "1. Testing Device Auth with token..."
  curl -s -w "\nHTTP Code: %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -X POST \
    -d '{"device_id": "test-device"}' \
    "$DEVICE_AUTH_URL/device-auth/initiate" | head -20
  
  echo ""
  echo "2. Testing TVM with token..."
  curl -s -w "\nHTTP Code: %{http_code}\n" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -X POST \
    -d '{"firebase_token": "test-token"}' \
    "$TVM_URL/token/exchange" | head -20
fi

echo ""
echo "=== Summary ==="
echo "The Cloud Run services are configured to require authentication."
echo "They should only be accessed through the API Gateway, which will"
echo "authenticate using its service account."
echo ""
echo "The current issue is that the API Gateway doesn't have the"
echo "backend configuration to route to these services."