#!/bin/bash
# Test the import functionality with existing resources

PROJECT_ID="test40620-463523"
PREFIX="anava2"
REGION="us-central1"

echo "Testing import functionality for existing resources..."
echo "Project: $PROJECT_ID"
echo "Prefix: $PREFIX"
echo ""

# Test if we can detect existing resources
echo "=== Checking for existing resources ==="

# Service Accounts
echo "Service Accounts:"
for SA in device-auth tvm vertex-ai apigw-invoker; do
  SA_EMAIL="${PREFIX}-${SA}-sa@${PROJECT_ID}.iam.gserviceaccount.com"
  if gcloud iam service-accounts describe $SA_EMAIL --project=$PROJECT_ID &>/dev/null; then
    echo "  ✓ Found: $SA_EMAIL"
  else
    echo "  ✗ Not found: $SA_EMAIL"
  fi
done

echo ""
echo "Secrets:"
for SECRET in firebase-config api-key; do
  SECRET_NAME="${PREFIX}-${SECRET}"
  if gcloud secrets describe $SECRET_NAME --project=$PROJECT_ID &>/dev/null; then
    echo "  ✓ Found: $SECRET_NAME"
  else
    echo "  ✗ Not found: $SECRET_NAME"
  fi
done

echo ""
echo "Storage Buckets:"
BUCKET="${PROJECT_ID}-${PREFIX}-function-source"
if gsutil ls -b gs://$BUCKET &>/dev/null; then
  echo "  ✓ Found: $BUCKET"
else
  echo "  ✗ Not found: $BUCKET"
fi

echo ""
echo "All checks completed. These resources would be imported during deployment."