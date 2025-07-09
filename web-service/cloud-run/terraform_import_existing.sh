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
  if gcloud iam service-accounts describe $SA_EMAIL --project=$PROJECT_ID &>/dev/null; then
    echo "Importing existing service account: $SA_EMAIL"
    terraform import -input=false "module.anava.google_service_account.${SA//-/_}" "projects/$PROJECT_ID/serviceAccounts/$SA_EMAIL" || true
  fi
done

# Secrets
for SECRET in firebase-config api-key; do
  SECRET_NAME="${PREFIX}-${SECRET}"
  if gcloud secrets describe $SECRET_NAME --project=$PROJECT_ID &>/dev/null; then
    echo "Importing existing secret: $SECRET_NAME"
    terraform import -input=false "module.anava.google_secret_manager_secret.${SECRET//-/_}" "projects/$PROJECT_ID/secrets/$SECRET_NAME" || true
  fi
done

# Storage Buckets
BUCKET="${PROJECT_ID}-${PREFIX}-function-source"
if gsutil ls -b gs://$BUCKET &>/dev/null; then
  echo "Importing existing bucket: $BUCKET"
  terraform import -input=false "module.anava.google_storage_bucket.function_source" $BUCKET || true
fi

# Workload Identity Pool
WIF_POOL="${PREFIX}-wif-pool"
if gcloud iam workload-identity-pools describe $WIF_POOL --location=global --project=$PROJECT_ID &>/dev/null; then
  echo "Importing existing workload identity pool: $WIF_POOL"
  terraform import -input=false "module.anava.google_iam_workload_identity_pool.device_auth" "projects/$PROJECT_ID/locations/global/workloadIdentityPools/$WIF_POOL" || true
fi

# API Gateway
API_NAME="${PREFIX}-api"
if gcloud api-gateway apis describe $API_NAME --project=$PROJECT_ID &>/dev/null; then
  echo "Importing existing API: $API_NAME"
  terraform import -input=false "module.anava.google_api_gateway_api.api" "projects/$PROJECT_ID/locations/global/apis/$API_NAME" || true
fi

echo "Import process completed"