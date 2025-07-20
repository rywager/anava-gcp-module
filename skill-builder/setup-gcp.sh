#!/bin/bash

# Setup GCP resources for Anava Skill Builder

set -e

PROJECT_ID=${GCP_PROJECT_ID:-"anava-ai"}
REGION=${GCP_REGION:-"us-central1"}
SERVICE_ACCOUNT_NAME="anava-skill-builder"

echo "🚀 Setting up GCP resources for Anava Skill Builder"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"

# Set the project
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "📋 Enabling required APIs..."
gcloud services enable \
    cloudbuild.googleapis.com \
    run.googleapis.com \
    containerregistry.googleapis.com \
    firestore.googleapis.com \
    secretmanager.googleapis.com \
    cloudresourcemanager.googleapis.com

# Create service account if it doesn't exist
echo "👤 Creating service account..."
if ! gcloud iam service-accounts describe ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com &>/dev/null; then
    gcloud iam service-accounts create $SERVICE_ACCOUNT_NAME \
        --display-name="Anava Skill Builder Service Account"
    echo "Service account created"
else
    echo "Service account already exists"
fi

# Grant necessary permissions
echo "🔐 Granting permissions..."
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/datastore.user"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
    --role="roles/logging.logWriter"

# Create Firestore database if it doesn't exist
echo "🗄️ Setting up Firestore..."
if ! gcloud firestore databases describe --database="(default)" &>/dev/null; then
    gcloud firestore databases create \
        --location=$REGION \
        --type=firestore-native
    echo "Firestore database created"
else
    echo "Firestore database already exists"
fi

# Create secret for SECRET_KEY if it doesn't exist
echo "🔑 Creating secrets..."
if ! gcloud secrets describe skill-builder-secret-key &>/dev/null; then
    # Generate a random secret key
    SECRET_KEY=$(openssl rand -hex 32)
    echo -n "$SECRET_KEY" | gcloud secrets create skill-builder-secret-key \
        --data-file=- \
        --replication-policy="automatic"
    echo "Secret key created"
else
    echo "Secret key already exists"
fi

# Grant Cloud Build permission to deploy
echo "🔨 Granting Cloud Build permissions..."
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/run.admin"

gcloud iam service-accounts add-iam-policy-binding \
    ${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser"

echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Deploy the service: ./deploy.sh"
echo "2. Or use Cloud Build: gcloud builds submit --config cloudbuild.prod.yaml"