#!/bin/bash
# Deploy script for UI updates and timeout fixes
# This script deploys the latest changes including the checklist UI

set -e

echo "🚀 Deploying Anava Deployment System with UI Updates"
echo "===================================================="

# Configuration
PROJECT_ID="anava-ai"
REGION="us-central1"
SERVICE_NAME="anava-deploy"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Step 1: Verify prerequisites
echo
echo "Step 1: Verifying prerequisites..."

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    print_error "gcloud CLI not found. Please install Google Cloud SDK."
    exit 1
fi

# Set project
gcloud config set project $PROJECT_ID
print_status "Project set to: $PROJECT_ID"

# Step 2: Build and deploy
echo
echo "Step 2: Building and deploying to Cloud Run..."

# Deploy directly from source
gcloud run deploy $SERVICE_NAME \
    --source . \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,REDIS_HOST=10.150.87.59" \
    --vpc-connector anava-deploy-connector \
    --vpc-egress private-ranges-only \
    --memory 2Gi \
    --cpu 2 \
    --timeout 3600 \
    --max-instances 10 \
    --concurrency 1000

print_status "Deployment complete!"

# Step 3: Get service URL
echo
echo "Step 3: Verifying deployment..."

SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')

echo
echo "===================================================="
echo "🎉 Deployment Complete!"
echo
echo "Service URL: $SERVICE_URL"
echo "Health Check: $SERVICE_URL/health"
echo
echo "Key updates deployed:"
echo "  ✓ New checklist UI for deployment progress"
echo "  ✓ Visual step tracking with status indicators"
echo "  ✓ Deployment outputs displayed in checklist"
echo "  ✓ Copy buttons for URLs and secrets"
echo "  ✓ 40-minute timeout for Terraform apply"
echo "  ✓ Enhanced project validation with API checks"
echo "  ✓ Logs hidden by default (toggle available)"
echo
echo "Test the new UI by:"
echo "  1. Visit $SERVICE_URL"
echo "  2. Login with Google"
echo "  3. Start a deployment to see the new checklist"
echo

# Quick health check
echo "Running health check..."
if curl -s $SERVICE_URL/health | grep -q "healthy"; then
    print_status "Service is healthy!"
else
    print_warning "Health check failed - service may still be starting"
fi