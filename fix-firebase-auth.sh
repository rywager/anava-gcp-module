#!/bin/bash

echo "=== Firebase Authentication Fix ==="
echo ""
echo "The error 'CONFIGURATION_NOT_FOUND' indicates that Firebase Authentication"
echo "is not properly configured for custom token authentication."
echo ""
echo "To fix this, you need to:"
echo ""
echo "1. Go to Firebase Console: https://console.firebase.google.com/project/ryanclean/authentication"
echo ""
echo "2. Enable Authentication if not already enabled"
echo ""
echo "3. Go to Sign-in method tab"
echo ""
echo "4. Ensure 'Custom' authentication is enabled"
echo ""
echo "5. The service account 'anava-device-auth-sa@ryanclean.iam.gserviceaccount.com'"
echo "   needs the 'Firebase Authentication Admin' role"
echo ""

# Check current service account permissions
echo "Checking service account permissions..."
echo ""

SA_EMAIL="anava-device-auth-sa@ryanclean.iam.gserviceaccount.com"

echo "Current roles for $SA_EMAIL:"
gcloud projects get-iam-policy ryanclean \
  --flatten="bindings[].members" \
  --filter="bindings.members:serviceAccount:$SA_EMAIL" \
  --format="table(bindings.role)" | grep -v ROLE || echo "No roles found"

echo ""
echo "To grant Firebase Auth Admin role:"
echo "gcloud projects add-iam-policy-binding ryanclean \\"
echo "  --member='serviceAccount:$SA_EMAIL' \\"
echo "  --role='roles/firebase.auth.admin'"
echo ""
echo "OR for a minimal approach, just grant token creator:"
echo "gcloud projects add-iam-policy-binding ryanclean \\"
echo "  --member='serviceAccount:$SA_EMAIL' \\"
echo "  --role='roles/iam.serviceAccountTokenCreator'"