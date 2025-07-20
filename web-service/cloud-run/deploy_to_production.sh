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

# Get Redis host
REDIS_HOST=$(gcloud redis instances describe anava-deploy-queue --region=us-central1 --format="value(host)")
echo "📡 Redis Host: $REDIS_HOST"

# First get the current service URL if it exists
CURRENT_URL=$(gcloud run services describe anava-deploy --region=us-central1 --format='value(status.url)' 2>/dev/null || echo "")

# Deploy the service
gcloud run deploy anava-deploy \
  --source . \
  --region us-central1 \
  --platform managed \
  --allow-unauthenticated \
  --set-env-vars="GOOGLE_CLOUD_PROJECT=$PROJECT_ID,COMMIT_SHA=$COMMIT_SHA,REDIS_HOST=$REDIS_HOST,REDIS_PORT=6379" \
  --service-account="anava-deploy-service@$PROJECT_ID.iam.gserviceaccount.com" \
  --max-instances=10 \
  --min-instances=1 \
  --memory=1Gi \
  --cpu=1 \
  --timeout=3600 \
  --vpc-connector="anava-deploy-connector"

# Get the new service URL
NEW_SERVICE_URL=$(gcloud run services describe anava-deploy --region=us-central1 --format='value(status.url)')

# Update redirect URI if URL changed
if [ "$CURRENT_URL" != "$NEW_SERVICE_URL" ]; then
  echo "🔄 Service URL changed, updating redirect URI..."
  gcloud run services update anava-deploy \
    --update-env-vars="REDIRECT_URI=$NEW_SERVICE_URL/callback" \
    --region=us-central1
fi

echo ""
echo "✅ Service deployed successfully!"

echo "🌐 Service URL: $NEW_SERVICE_URL"

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
echo "- URL: $NEW_SERVICE_URL"
echo "- Features: Firebase storage location selector, retry logic, manual intervention handling"
echo ""
echo "🧪 Test the deployment at: $NEW_SERVICE_URL"