#!/bin/bash

# Anava Skill Builder Deployment Script

set -e

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-"anava-ai"}
REGION=${GCP_REGION:-"us-central1"}
SERVICE_NAME="anava-skill-builder"
IMAGE_NAME="gcr.io/$PROJECT_ID/$SERVICE_NAME"

echo "🚀 Deploying Anava Skill Builder"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"

# Check if gcloud is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo "❌ Not authenticated with gcloud. Please run 'gcloud auth login'"
    exit 1
fi

# Set the project
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "📋 Enabling required APIs..."
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable containerregistry.googleapis.com
gcloud services enable firestore.googleapis.com

# Build and deploy using Cloud Build
echo "🔨 Building and deploying with Cloud Build..."
gcloud builds submit --config cloudbuild.yaml \
    --substitutions=_REGION=$REGION

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
    --region=$REGION \
    --format="value(status.url)")

echo "✅ Deployment complete!"
echo "🌐 Service URL: $SERVICE_URL"
echo ""
echo "📊 Test the deployment:"
echo "curl $SERVICE_URL/health"
echo ""
echo "🔗 API Documentation: $SERVICE_URL/docs"
echo ""
echo "🎯 Example usage:"
echo "curl -X POST $SERVICE_URL/api/chat/message \\"
echo "  -H 'Content-Type: application/json' \\"
echo "  -d '{\"content\": \"Monitor my loading dock for unauthorized access at night\"}'"