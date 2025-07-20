#!/bin/bash

# Test Firebase token exchange (Step 2)

FIREBASE_WEB_API_KEY="AIzaSyBCHhtkBv0utzs3kukoad8iIbtDTm0ZADE"  # From the camera config

echo "=== Testing Firebase Token Exchange (Step 2) ==="
echo ""

# First, get a fresh custom token from our API Gateway
echo "1. Getting fresh custom token from API Gateway..."
CUSTOM_TOKEN=$(curl -s -X POST \
  "https://anava-gateway-2gvbe0bn.uc.gateway.dev/device-auth/initiate" \
  -H "x-api-key: AIzaSyCprB_r1KDwAMBteqjh2hfdlzzgPjtxvWY" \
  -H "Content-Type: application/json" \
  -d '{"device_id": "test-device"}' | jq -r '.firebase_custom_token')

if [ -z "$CUSTOM_TOKEN" ] || [ "$CUSTOM_TOKEN" = "null" ]; then
  echo "Failed to get custom token from API Gateway"
  exit 1
fi

echo "Got custom token (first 50 chars): ${CUSTOM_TOKEN:0:50}..."
echo ""

# Now exchange it for a Firebase ID token
echo "2. Exchanging custom token for Firebase ID token..."
RESPONSE=$(curl -s -X POST \
  "https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=$FIREBASE_WEB_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"token\": \"$CUSTOM_TOKEN\",
    \"returnSecureToken\": true
  }")

echo "Response:"
echo "$RESPONSE" | jq .

# Check if we got an ID token
ID_TOKEN=$(echo "$RESPONSE" | jq -r '.idToken')
if [ ! -z "$ID_TOKEN" ] && [ "$ID_TOKEN" != "null" ]; then
  echo ""
  echo "✅ Step 2 SUCCESS! Got Firebase ID token"
  echo "ID token (first 50 chars): ${ID_TOKEN:0:50}..."
  
  # Now test Step 3 - exchange for GCP token
  echo ""
  echo "3. Testing Step 3 - Exchange Firebase token for GCP token via TVM..."
  TVM_RESPONSE=$(curl -s -X POST \
    "https://anava-gateway-2gvbe0bn.uc.gateway.dev/gcp-token/vend" \
    -H "x-api-key: AIzaSyCprB_r1KDwAMBteqjh2hfdlzzgPjtxvWY" \
    -H "Content-Type: application/json" \
    -d "{\"firebase_id_token\": \"$ID_TOKEN\"}")
  
  echo "TVM Response:"
  echo "$TVM_RESPONSE" | jq . 2>/dev/null || echo "$TVM_RESPONSE"
else
  echo ""
  echo "❌ Step 2 FAILED! Could not get Firebase ID token"
  echo "Error: $(echo "$RESPONSE" | jq -r '.error.message')"
fi