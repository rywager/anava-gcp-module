#!/bin/bash
set -e

echo "🚀 Deploying Firebase Storage Fix to Production"
echo "=============================================="

# Get current project
PROJECT_ID=$(gcloud config get-value project)
echo "📋 Project: $PROJECT_ID"

# Deploy the main service
echo ""
echo "📦 Deploying anava-deploy service..."

# Get current git commit
COMMIT_SHA=$(git rev-parse --short HEAD)
echo "📌 Commit: $COMMIT_SHA"

gcloud run deploy anava-deploy \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,COMMIT_SHA=$COMMIT_SHA" \
  --service-account="anava-deploy-service@$PROJECT_ID.iam.gserviceaccount.com" \
  --max-instances=10 \
  --min-instances=1 \
  --memory=1Gi \
  --cpu=1 \
  --timeout=3600

echo ""
echo "✅ Service deployed successfully!"

# Get the service URL
SERVICE_URL=$(gcloud run services describe anava-deploy --region=us-central1 --format='value(status.url)')
echo "🌐 Service URL: $SERVICE_URL"

# Update the terraform module cache (if needed)
echo ""
echo "📚 Updating Terraform module cache..."
# The module is cached in the container, so we need to ensure it's updated
# This happens automatically when the service is redeployed

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📊 Deployment Summary:"
echo "- Service: anava-deploy"
echo "- Region: us-central1"
echo "- URL: $SERVICE_URL"
echo "- Features: Firebase storage location selector"
echo ""
echo "🧪 Test the deployment at: $SERVICE_URL"