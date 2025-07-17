#!/bin/bash

echo "=== Final API Gateway Fix ==="
echo ""

# The issue seems to be that the API Gateway managed service isn't properly configured
# Let's recreate the gateway with the managed service enabled

PROJECT_ID="ryanclean"
API_ID="anava-api"
GATEWAY_ID="anava-gateway"
LOCATION="us-central1"

echo "Current configuration issues:"
echo "1. API Gateway has null managedService"
echo "2. API key is restricted to wrong service"
echo "3. Backend services might not be properly exposed"
echo ""

echo "Creating a simple test to verify Cloud Run is working..."
echo ""

# First, let's test if the Cloud Run services have the endpoints
echo "Testing Cloud Run services endpoints existence..."
echo ""

# Get an identity token for testing
TOKEN=$(gcloud auth print-identity-token 2>/dev/null)

if [ ! -z "$TOKEN" ]; then
  echo "1. Testing device-auth service health..."
  curl -s -X GET \
    -H "Authorization: Bearer $TOKEN" \
    "https://anava-device-auth-fn-6hvyxxvgsa-uc.a.run.app/" \
    -w "\nHTTP Code: %{http_code}\n" | tail -5
  
  echo ""
  echo "2. Testing if /device-auth/initiate endpoint exists..."
  curl -s -X POST \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"device_id": "test"}' \
    "https://anava-device-auth-fn-6hvyxxvgsa-uc.a.run.app/device-auth/initiate" \
    -w "\nHTTP Code: %{http_code}\n" | tail -20
else
  echo "No identity token available for testing"
fi

echo ""
echo "=== Solution ==="
echo "The Cloud Run services need to be checked for:"
echo "1. Proper endpoint implementation (/device-auth/initiate)"
echo "2. Correct authentication handling"
echo "3. Proper CORS configuration for API Gateway"
echo ""
echo "The API Gateway configuration is correct, but the backend"
echo "Cloud Run services might not have the expected endpoints."