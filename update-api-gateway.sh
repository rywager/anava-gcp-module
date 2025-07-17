#!/bin/bash

# Update API Gateway configuration to properly route to Cloud Run services

PROJECT_ID="ryanclean"
API_ID="anava-api"
GATEWAY_ID="anava-gateway"
LOCATION="us-central1"
CONFIG_ID="anava-api-config-$(date +%Y%m%d-%H%M%S)"

echo "=== Updating API Gateway Configuration ==="
echo "Project: $PROJECT_ID"
echo "API: $API_ID"
echo "Gateway: $GATEWAY_ID"
echo "New Config: $CONFIG_ID"
echo ""

# First, we need to grant the API Gateway service account permission to invoke Cloud Run
echo "1. Using API Gateway service account..."
# We know the service account from the previous check
GATEWAY_SA="anava-apigw-invoker-sa@ryanclean.iam.gserviceaccount.com"

echo "API Gateway Service Account: $GATEWAY_SA"
echo ""

echo "2. Granting Cloud Run invoker permissions..."
# Grant permission to invoke device-auth service
gcloud run services add-iam-policy-binding anava-device-auth-fn \
  --location=$LOCATION \
  --member="serviceAccount:$GATEWAY_SA" \
  --role="roles/run.invoker" \
  --project=$PROJECT_ID 2>/dev/null

# Grant permission to invoke TVM service  
gcloud run services add-iam-policy-binding anava-tvm-fn \
  --location=$LOCATION \
  --member="serviceAccount:$GATEWAY_SA" \
  --role="roles/run.invoker" \
  --project=$PROJECT_ID 2>/dev/null

echo "Permissions granted."
echo ""

echo "3. Creating new API config..."
gcloud api-gateway api-configs create $CONFIG_ID \
  --api=$API_ID \
  --openapi-spec=api-gateway-config.yaml \
  --project=$PROJECT_ID \
  --backend-auth-service-account=$GATEWAY_SA

if [ $? -eq 0 ]; then
  echo ""
  echo "4. Updating gateway to use new config..."
  gcloud api-gateway gateways update $GATEWAY_ID \
    --api=$API_ID \
    --api-config=$CONFIG_ID \
    --location=$LOCATION \
    --project=$PROJECT_ID
    
  echo ""
  echo "✅ API Gateway configuration updated successfully!"
  echo ""
  echo "The gateway should now properly route:"
  echo "- POST /device-auth/initiate -> Cloud Run device auth service"
  echo "- POST /token/exchange -> Cloud Run TVM service"
  echo ""
  echo "It may take a few minutes for the changes to propagate."
else
  echo "❌ Failed to create API config. Please check the error above."
fi