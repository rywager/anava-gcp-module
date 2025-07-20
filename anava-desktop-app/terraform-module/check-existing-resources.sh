#!/bin/bash

# Script to check for existing resources and prepare Terraform state
# This helps handle partial deployments

PROJECT_ID=$1
SOLUTION_PREFIX=$2

if [ -z "$PROJECT_ID" ] || [ -z "$SOLUTION_PREFIX" ]; then
    echo "Usage: $0 PROJECT_ID SOLUTION_PREFIX"
    exit 1
fi

echo "Checking for existing resources in project: $PROJECT_ID"

# Check if Firebase storage bucket exists
FIREBASE_BUCKET="${PROJECT_ID}-${SOLUTION_PREFIX}-firebase"
if gsutil ls -b "gs://${FIREBASE_BUCKET}" 2>/dev/null; then
    echo "✓ Firebase bucket exists: ${FIREBASE_BUCKET}"
    echo "FIREBASE_BUCKET_EXISTS=true" >> resource-status.env
else
    echo "✗ Firebase bucket does not exist"
    echo "FIREBASE_BUCKET_EXISTS=false" >> resource-status.env
fi

# Check if function source bucket exists
FUNCTION_BUCKET="${PROJECT_ID}-${SOLUTION_PREFIX}-function-source"
if gsutil ls -b "gs://${FUNCTION_BUCKET}" 2>/dev/null; then
    echo "✓ Function source bucket exists: ${FUNCTION_BUCKET}"
    echo "FUNCTION_BUCKET_EXISTS=true" >> resource-status.env
else
    echo "✗ Function source bucket does not exist"
    echo "FUNCTION_BUCKET_EXISTS=false" >> resource-status.env
fi

# Check if Firebase project is initialized
if gcloud firebase projects describe "$PROJECT_ID" 2>/dev/null; then
    echo "✓ Firebase project is initialized"
    echo "FIREBASE_PROJECT_EXISTS=true" >> resource-status.env
else
    echo "✗ Firebase project is not initialized"
    echo "FIREBASE_PROJECT_EXISTS=false" >> resource-status.env
fi

# Check if service accounts exist
for SA in "${SOLUTION_PREFIX}-device-auth-sa" "${SOLUTION_PREFIX}-tvm-sa" "${SOLUTION_PREFIX}-vertex-ai-sa" "${SOLUTION_PREFIX}-apigw-invoker-sa"; do
    if gcloud iam service-accounts describe "${SA}@${PROJECT_ID}.iam.gserviceaccount.com" --project="$PROJECT_ID" 2>/dev/null; then
        echo "✓ Service account exists: ${SA}"
    else
        echo "✗ Service account does not exist: ${SA}"
    fi
done

# Check if WIF pool exists
if gcloud iam workload-identity-pools describe "${SOLUTION_PREFIX}-wif-pool" --location=global --project="$PROJECT_ID" 2>/dev/null; then
    echo "✓ Workload Identity Pool exists"
    echo "WIF_POOL_EXISTS=true" >> resource-status.env
else
    echo "✗ Workload Identity Pool does not exist"
    echo "WIF_POOL_EXISTS=false" >> resource-status.env
fi

# Check if API Gateway exists
if gcloud api-gateway apis describe "${SOLUTION_PREFIX}-api" --project="$PROJECT_ID" 2>/dev/null; then
    echo "✓ API Gateway API exists"
    echo "API_GATEWAY_EXISTS=true" >> resource-status.env
    
    # Get gateway URL if it exists
    GATEWAY_URL=$(gcloud api-gateway gateways list --project="$PROJECT_ID" --format="value(defaultHostname)" --filter="displayName:${SOLUTION_PREFIX}" 2>/dev/null | head -1)
    if [ -n "$GATEWAY_URL" ]; then
        echo "✓ API Gateway URL: https://${GATEWAY_URL}"
        echo "API_GATEWAY_URL=https://${GATEWAY_URL}" >> resource-status.env
    fi
else
    echo "✗ API Gateway API does not exist"
    echo "API_GATEWAY_EXISTS=false" >> resource-status.env
fi

echo ""
echo "Resource check complete. Status saved to resource-status.env"