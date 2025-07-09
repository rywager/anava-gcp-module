#!/bin/bash
# Deploy script for granular UI updates
# This script deploys the improved checklist showing individual resource creation

set -e

echo "🚀 Deploying Anava System with Granular Progress Tracking"
echo "========================================================="

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

# Step 1: Deploy to Cloud Run
echo
echo "Step 1: Deploying to Cloud Run..."

gcloud run deploy $SERVICE_NAME \
    --source . \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT_ID,REDIS_HOST=10.150.87.59,REDIRECT_URI=https://anava-deploy-392865621461.us-central1.run.app/callback" \
    --vpc-connector anava-deploy-connector \
    --vpc-egress private-ranges-only \
    --memory 2Gi \
    --cpu 2 \
    --timeout 3600 \
    --max-instances 10 \
    --concurrency 1000

print_status "Deployment complete!"

# Step 2: Get service URL
echo
echo "Step 2: Verifying deployment..."

SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')

echo
echo "========================================================="
echo "🎉 Deployment Complete!"
echo
echo "Service URL: $SERVICE_URL"
echo "Health Check: $SERVICE_URL/health"
echo
echo "Key improvements in this deployment:"
echo "  ✓ Granular progress tracking - see each resource being created"
echo "  ✓ 9 deployment steps instead of 5"
echo "  ✓ Individual tracking for:"
echo "    - Service Accounts creation"
echo "    - Secret Manager setup"
echo "    - Cloud Storage configuration"
echo "    - Firestore database setup"
echo "    - Cloud Functions deployment"
echo "    - API Gateway creation"
echo "    - Workload Identity configuration"
echo "  ✓ Removed unnecessary cleanup steps"
echo "  ✓ Better resource identification in logs"
echo
echo "Test the improved UI by:"
echo "  1. Visit $SERVICE_URL"
echo "  2. Login with Google"
echo "  3. Start a deployment to see detailed progress"
echo

# Quick health check
echo "Running health check..."
if curl -s $SERVICE_URL/health | grep -q "healthy"; then
    print_status "Service is healthy!"
else
    print_warning "Health check may be pending - service starting up"
fi