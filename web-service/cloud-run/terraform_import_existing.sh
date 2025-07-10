#!/bin/bash
# Import existing resources to prevent creation conflicts

PROJECT_ID=$1
PREFIX=$2
TERRAFORM_DIR=$3

cd $TERRAFORM_DIR

echo "Checking for existing resources to import..."

# Service Accounts
for SA in device-auth tvm vertex-ai apigw-invoker; do
  SA_EMAIL="${PREFIX}-${SA}-sa@${PROJECT_ID}.iam.gserviceaccount.com"
  echo "Attempting to import service account: $SA_EMAIL"
  terraform import -input=false "module.anava.google_service_account.${SA//-/_}" "projects/$PROJECT_ID/serviceAccounts/$SA_EMAIL" 2>/dev/null || true
done

# Secrets
for SECRET in firebase-config api-key; do
  SECRET_NAME="${PREFIX}-${SECRET}"
  echo "Attempting to import secret: $SECRET_NAME"
  terraform import -input=false "module.anava.google_secret_manager_secret.${SECRET//-/_}" "projects/$PROJECT_ID/secrets/$SECRET_NAME" 2>/dev/null || true
done

# Storage Buckets
BUCKET="${PROJECT_ID}-${PREFIX}-function-source"
echo "Attempting to import bucket: $BUCKET"
terraform import -input=false "module.anava.google_storage_bucket.function_source" $BUCKET 2>/dev/null || true

# Workload Identity Pool
WIF_POOL="${PREFIX}-wif-pool"
echo "Attempting to import workload identity pool: $WIF_POOL"
terraform import -input=false "module.anava.google_iam_workload_identity_pool.device_auth" "projects/$PROJECT_ID/locations/global/workloadIdentityPools/$WIF_POOL" 2>/dev/null || true

# API Gateway
API_NAME="${PREFIX}-api"
echo "Attempting to import API Gateway: $API_NAME"
terraform import -input=false "module.anava.google_api_gateway_api.api" "projects/$PROJECT_ID/locations/global/apis/$API_NAME" 2>/dev/null || true

# Firestore uses default database - no import needed

# Firebase Project
echo "Attempting to import Firebase project"
terraform import -input=false "module.anava.google_firebase_project.default" "projects/$PROJECT_ID" 2>/dev/null || true

# Firebase Web App
WEB_APP_NAME="${PREFIX}-web"
echo "Attempting to import Firebase web app: $WEB_APP_NAME"
# Try to import with a constructed app ID - will fail silently if the app doesn't exist
terraform import -input=false "module.anava.google_firebase_web_app.basic" "projects/$PROJECT_ID/webApps/${PREFIX}-web" 2>/dev/null || true

# Firebase Storage Bucket
FIREBASE_BUCKET="${PROJECT_ID}-${PREFIX}-firebase"
echo "Attempting to import Firebase storage bucket: $FIREBASE_BUCKET"
terraform import -input=false "module.anava.google_storage_bucket.firebase_bucket" $FIREBASE_BUCKET 2>/dev/null || true

echo "Import process completed"