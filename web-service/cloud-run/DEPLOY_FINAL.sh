#!/bin/bash
# FINAL deployment - ensures all changes are live

set -e

echo "🚀 FINAL DEPLOYMENT - Ensuring all changes are live"
echo "=================================================="

# Force add all files
git add -A
git commit -m "FINAL: All UI and backend fixes" || true

# Deploy with explicit timeout
echo "Deploying to Cloud Run (this will take 3-5 minutes)..."
gcloud run deploy anava-deploy \
    --source . \
    --region us-central1 \
    --platform managed \
    --allow-unauthenticated \
    --set-env-vars "GOOGLE_CLOUD_PROJECT=anava-ai,REDIS_HOST=10.150.87.59,REDIRECT_URI=https://anava-deploy-392865621461.us-central1.run.app/callback" \
    --vpc-connector anava-deploy-connector \
    --vpc-egress private-ranges-only \
    --memory 2Gi \
    --cpu 2 \
    --timeout 3600 \
    --max-instances 10 \
    --concurrency 1000 \
    --no-traffic

# Get the new revision
NEW_REVISION=$(gcloud run services describe anava-deploy --region us-central1 --format="value(status.latestCreatedRevisionName)")
echo "New revision created: $NEW_REVISION"

# Send all traffic to new revision
echo "Sending traffic to new revision..."
gcloud run services update-traffic anava-deploy \
    --region us-central1 \
    --to-revisions=$NEW_REVISION=100

echo "Testing deployment..."
sleep 5
python3 test_deployment_e2e.py

echo "=================================================="
echo "Deployment complete!"
echo "Visit: https://anava-deploy-392865621461.us-central1.run.app"