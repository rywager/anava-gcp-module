#!/bin/bash
# Deploy v2.3.13 - Fix Firebase Release errors and UI issues

echo "🚀 Deploying v2.3.13 - Complete fix for Firebase errors and UI issues"
echo "====================================================================="
echo ""
echo "✅ Changes in this version:"
echo "  Backend fixes:"
echo "  - Added IGNORABLE_ERRORS to handle 'Release already exists' gracefully"
echo "  - Fixed retry handler to treat ignorable errors as success"
echo "  - Modified Terraform configuration for existing Firebase releases"
echo "  - Added pre-deployment check for existing Firebase resources"
echo "  - Pass version info to dashboard template"
echo ""
echo "  UI fixes:"
echo "  - Fixed version badge to show actual version from backend"
echo "  - Improved duplicate log detection using content hashes"
echo "  - Better progress tracking with actual resource counts"
echo "  - Real-time step synchronization from backend status"
echo "  - Smarter resource type detection and categorization"
echo ""

# Get current commit for tracking
COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "manual-deploy")

echo "📦 Building and deploying to Cloud Run..."
gcloud run deploy terraform-installer \
  --source . \
  --region us-central1 \
  --project anava-ai \
  --memory 2Gi \
  --cpu 2 \
  --timeout 900 \
  --concurrency 10 \
  --max-instances 5 \
  --min-instances 1 \
  --port 8080 \
  --allow-unauthenticated \
  --set-env-vars "COMMIT_SHA=$COMMIT_SHA,REDIS_HOST=10.75.149.196" \
  --service-account terraform-installer@anava-ai.iam.gserviceaccount.com

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deployment successful!"
    echo ""
    echo "🔍 View logs:"
    echo "gcloud run services logs read terraform-installer --limit=50 --project=anava-ai"
    echo ""
    echo "🌐 Service URL:"
    echo "https://terraform-installer-7dvb7sj5ra-uc.a.run.app"
    echo ""
    echo "📝 Version v2.3.13 is now live!"
else
    echo ""
    echo "❌ Deployment failed! Check the error messages above."
    exit 1
fi