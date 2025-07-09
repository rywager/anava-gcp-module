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

# Firestore Database
DATABASE_ID="${PREFIX}"
if gcloud firestore databases describe --database=$DATABASE_ID --project=$PROJECT_ID &>/dev/null; then
  echo "Importing existing Firestore database: $DATABASE_ID"
  terraform import -input=false "module.anava.google_firestore_database.database" "projects/$PROJECT_ID/databases/$DATABASE_ID" || true
fi

# Firebase Project (if exists)
if gcloud firebase projects describe $PROJECT_ID &>/dev/null; then
  echo "Importing existing Firebase project"
  terraform import -input=false "module.anava.google_firebase_project.default" "projects/$PROJECT_ID" || true
fi

# Firebase Web App
WEB_APP_NAME="${PREFIX}-web"
# List Firebase apps and check if our app exists
if gcloud firebase apps list --project=$PROJECT_ID --filter="displayName:$WEB_APP_NAME" --format="value(appId)" | grep -q .; then
  APP_ID=$(gcloud firebase apps list --project=$PROJECT_ID --filter="displayName:$WEB_APP_NAME" --format="value(appId)" | head -1)
  if [ ! -z "$APP_ID" ]; then
    echo "Importing existing Firebase web app: $APP_ID"
    terraform import -input=false "module.anava.google_firebase_web_app.basic" "$APP_ID" || true
  fi
fi

# Firebase Storage Bucket (default bucket)
DEFAULT_BUCKET="${PROJECT_ID}.appspot.com"
if gsutil ls -b gs://$DEFAULT_BUCKET &>/dev/null; then
  echo "Importing existing Firebase default storage bucket: $DEFAULT_BUCKET"
  terraform import -input=false "module.anava.google_storage_bucket.firebase_bucket" $DEFAULT_BUCKET || true
fi

echo "Import process completed"