#!/bin/bash

# Update camera configuration with working API key

CAMERA_IP="192.168.1.100"  # Replace with your camera IP
NEW_API_KEY="AIzaSyCprB_r1KDwAMBteqjh2hfdlzzgPjtxvWY"  # Unrestricted key that works

echo "=== Update Camera Configuration ==="
echo ""
echo "This script will update your camera with the working API key."
echo ""
echo "Configuration to send:"
echo "- API Gateway URL: https://anava-gateway-2gvbe0bn.uc.gateway.dev (no change)"
echo "- API Key: ${NEW_API_KEY:0:10}...${NEW_API_KEY: -4} (NEW - unrestricted)"
echo "- Device Auth URL: https://anava-device-auth-fn-6hvyxxvgsa-uc.a.run.app (no change)"
echo "- TVM URL: https://anava-tvm-fn-6hvyxxvgsa-uc.a.run.app (no change)"
echo ""

# Create the configuration payload with the new API key
cat > /tmp/camera-config.json << EOF
{
  "command": "setTerraformConfig",
  "config": {
    "apiGatewayUrl": "https://anava-gateway-2gvbe0bn.uc.gateway.dev",
    "apiKey": "$NEW_API_KEY",
    "deviceAuthUrl": "https://anava-device-auth-fn-6hvyxxvgsa-uc.a.run.app",
    "tvmUrl": "https://anava-tvm-fn-6hvyxxvgsa-uc.a.run.app",
    "firebaseConfig": {
      "projectId": "ryanclean",
      "apiKey": "AIzaSyBCHhtkBv0utzs3kukoad8iIbtDTm0ZADE",
      "authDomain": "ryanclean.firebaseapp.com",
      "storageBucket": "ryanclean-anava-firebase",
      "databaseURL": "https://ryanclean.firebaseio.com",
      "appId": "1:193450426403:web:bc618f5b6eb506a63df196"
    },
    "serviceAccounts": {
      "vertexAi": "anava-vertex-ai-sa@ryanclean.iam.gserviceaccount.com",
      "deviceAuth": "anava-device-auth-sa@ryanclean.iam.gserviceaccount.com",
      "tvm": "anava-tvm-sa@ryanclean.iam.gserviceaccount.com",
      "apiGateway": "anava-apigw-invoker-sa@ryanclean.iam.gserviceaccount.com"
    },
    "storageBuckets": {
      "firebase": "ryanclean-anava-firebase",
      "functionSource": "ryanclean-anava-function-source"
    },
    "wifProvider": "projects/193450426403/locations/global/workloadIdentityPools/anava-wif-pool/providers/anava-firebase-provider"
  }
}
EOF

echo "Enter your camera IP address (or press Enter for $CAMERA_IP):"
read USER_IP
if [ ! -z "$USER_IP" ]; then
  CAMERA_IP="$USER_IP"
fi

echo ""
echo "Sending configuration to camera at $CAMERA_IP..."
curl -X POST "http://$CAMERA_IP/local/BatonAnalytic/baton_analytic.cgi" \
  -H "Content-Type: application/json" \
  -d @/tmp/camera-config.json \
  -w "\nHTTP Code: %{http_code}\n"

echo ""
echo "Configuration sent! The camera should now use the working API key."
echo ""
echo "To verify, check the camera logs for successful authentication."