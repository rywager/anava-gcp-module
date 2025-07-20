#!/bin/bash

# Cloud Orchestrator Deployment Script
set -e

# Configuration
PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-"your-project-id"}
REGION=${REGION:-"us-central1"}
SERVICE_NAME="cloud-orchestrator"
IMAGE_NAME="gcr.io/${PROJECT_ID}/${SERVICE_NAME}"

echo "Deploying Cloud Orchestrator to Google Cloud Run..."
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"

# Check if gcloud is installed and authenticated
if ! command -v gcloud &> /dev/null; then
    echo "Error: gcloud CLI is not installed"
    exit 1
fi

# Check if logged in
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n 1 &> /dev/null; then
    echo "Error: Not authenticated with gcloud. Run 'gcloud auth login'"
    exit 1
fi

# Set the project
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "Enabling required APIs..."
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable firestore.googleapis.com

# Build and push the image
echo "Building and pushing Docker image..."
gcloud builds submit --tag $IMAGE_NAME .

# Create secrets if they don't exist
echo "Creating secrets..."
gcloud secrets create cloud-orchestrator-secrets --replication-policy="automatic" || echo "Secret already exists"

# Deploy to Cloud Run
echo "Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_NAME \
  --platform managed \
  --region $REGION \
  --allow-unauthenticated \
  --port 8080 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 3600 \
  --concurrency 1000 \
  --min-instances 1 \
  --max-instances 100 \
  --set-env-vars "NODE_ENV=production,LOG_LEVEL=info,FIREBASE_PROJECT_ID=$PROJECT_ID,MAX_CONNECTIONS=1000" \
  --update-secrets="/etc/secrets/redis-url=cloud-orchestrator-secrets:redis-url"

# Get the service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME --platform managed --region $REGION --format 'value(status.url)')

echo "Deployment completed successfully!"
echo "Service URL: $SERVICE_URL"
echo "Health check: $SERVICE_URL/health"

# Test the deployment
echo "Testing deployment..."
if curl -f "$SERVICE_URL/health" > /dev/null 2>&1; then
    echo "✅ Health check passed"
else
    echo "❌ Health check failed"
    exit 1
fi

echo "🎉 Cloud Orchestrator deployed successfully!"
echo ""
echo "Next steps:"
echo "1. Update your frontend to connect to: $SERVICE_URL"
echo "2. Configure your Edge Gateways to connect to: $SERVICE_URL"
echo "3. Set up monitoring and alerting"
echo "4. Configure custom domain if needed"