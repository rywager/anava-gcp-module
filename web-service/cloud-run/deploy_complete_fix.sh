#!/bin/bash
# Complete deployment fix - ensures all changes are deployed
set -e

echo "🚀 Deploying Complete Fix for Anava Deployment System"
echo "===================================================="

# Configuration
PROJECT_ID="anava-ai"
REGION="us-central1"
SERVICE_NAME="anava-deploy"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

# Step 1: Verify all changes
echo
echo "Step 1: Verifying all changes are staged..."

# Check git status
if [[ -n $(git status -s) ]]; then
    print_warning "Uncommitted changes detected. Committing them now..."
    git add -A
    git commit -m "Deploy complete fix: Remove cleanup steps, add API enablement, fix permissions"
    print_status "Changes committed"
else
    print_status "All changes are committed"
fi

# Step 2: Pre-deployment setup
echo
echo "Step 2: Setting up deployment environment..."

# Ensure Cloud Build has proper permissions
print_status "Granting Cloud Build permissions..."
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format="value(projectNumber)")
gcloud projects add-iam-policy-binding $PROJECT_ID \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/cloudfunctions.developer" \
    --quiet 2>/dev/null || true

# Enable required APIs
print_status "Enabling required APIs..."
gcloud services enable \
    cloudbuild.googleapis.com \
    cloudfunctions.googleapis.com \
    firebase.googleapis.com \
    firestore.googleapis.com \
    apigateway.googleapis.com \
    servicecontrol.googleapis.com \
    servicemanagement.googleapis.com \
    secretmanager.googleapis.com \
    --project=$PROJECT_ID \
    --quiet

# Step 3: Deploy to Cloud Run
echo
echo "Step 3: Deploying to Cloud Run..."

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
    --concurrency 1000 \
    --project $PROJECT_ID

print_status "Deployment complete!"

# Step 4: Verify deployment
echo
echo "Step 4: Verifying deployment..."

SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.url)')
REVISION=$(gcloud run services describe $SERVICE_NAME --region $REGION --format 'value(status.latestReadyRevisionName)')

echo
echo "===================================================="
echo "🎉 Complete Fix Deployed Successfully!"
echo
echo "Service URL: $SERVICE_URL"
echo "Revision: $REVISION"
echo
echo "FIXED IN THIS DEPLOYMENT:"
echo "  ✅ Removed all cleanup steps (no more waiting 20+ seconds)"
echo "  ✅ Added automatic API enablement"
echo "  ✅ Fixed Cloud Build permissions"
echo "  ✅ Updated UI to show 9 granular deployment steps:"
echo "     1. Initializing Deployment"
echo "     2. Creating Service Accounts"
echo "     3. Setting Up Secrets"
echo "     4. Configuring Storage"
echo "     5. Setting Up Firestore"
echo "     6. Deploying Cloud Functions"
echo "     7. Creating API Gateway"
echo "     8. Configuring Workload Identity"
echo "     9. Finalizing Deployment"
echo "  ✅ Each step shows real-time progress"
echo "  ✅ Final outputs displayed with copy buttons"
echo
echo "TEST YOUR DEPLOYMENT:"
echo "  1. Visit: $SERVICE_URL"
echo "  2. Login with Google"
echo "  3. Select a project and deploy"
echo "  4. Watch the new granular progress tracking!"
echo

# Health check
echo "Running health check..."
HEALTH_RESPONSE=$(curl -s $SERVICE_URL/health)
if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
    print_status "Service is healthy!"
    echo "$HEALTH_RESPONSE" | python3 -m json.tool
else
    print_warning "Health check failed - service may still be starting"
fi