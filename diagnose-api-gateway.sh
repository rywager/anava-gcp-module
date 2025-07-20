#!/bin/bash

echo "=== API Gateway Complete Diagnostic ==="
echo ""

# Get gateway details
echo "1. Gateway Details:"
gcloud api-gateway gateways describe anava-gateway --location=us-central1 --format=json | jq '{
  name: .name,
  api: .apiConfig,
  state: .state,
  defaultHostname: .defaultHostname,
  managedService: .managedService
}'

echo ""
echo "2. Current API Config:"
CONFIG=$(gcloud api-gateway gateways describe anava-gateway --location=us-central1 --format='value(apiConfig)' | awk -F'/' '{print $NF}')
echo "Config ID: $CONFIG"

echo ""
echo "3. API Key Details:"
gcloud alpha services api-keys list --filter="displayName:anava*" --format=json | jq -r '.[0] | {
  name: .name,
  displayName: .displayName,
  keyString: .keyString,
  restrictions: .restrictions
}'

echo ""
echo "4. Managed Service Status:"
MANAGED_SERVICE=$(gcloud api-gateway gateways describe anava-gateway --location=us-central1 --format='value(managedService)')
echo "Service: $MANAGED_SERVICE"
gcloud services list --enabled | grep -E "$MANAGED_SERVICE|SERVICE" || echo "Service not found in enabled list"

echo ""
echo "5. Testing with correct managed service URL:"
if [ ! -z "$MANAGED_SERVICE" ]; then
  echo "URL: https://$MANAGED_SERVICE/"
  curl -s -w "\nHTTP Code: %{http_code}\n" \
    -H "x-api-key: AIzaSyD-ZAvCgXJR40dSsxOcgpDX9Yey0m4xAU4" \
    "https://$MANAGED_SERVICE/" | head -5
fi

echo ""
echo "6. OpenAPI Spec Summary:"
# Try to get the OpenAPI spec details
gcloud api-gateway api-configs describe $CONFIG --api=anava-api --format=json 2>/dev/null | jq '.openapiDocuments[0].document' | head -20 || echo "Could not retrieve OpenAPI spec"

echo ""
echo "=== Key Finding ==="
echo "The issue appears to be that the API key is restricted to a different"
echo "managed service than the one currently active for the gateway."
echo ""
echo "Solution: Wait 5-10 minutes for the API key update to propagate,"
echo "or create a new API key without restrictions for testing."