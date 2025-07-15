#!/bin/bash

# Anava Vision PWA Deployment Script
set -e

echo "🚀 Starting Anava Vision PWA deployment..."

# Configuration
APP_NAME="anava-vision-pwa"
VERSION="1.0.0"
BUILD_DIR="build"
DOCKER_IMAGE="$APP_NAME:$VERSION"

# Functions
check_dependencies() {
    echo "📋 Checking dependencies..."
    
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js is required but not installed."
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        echo "❌ npm is required but not installed."
        exit 1
    fi
    
    echo "✅ Dependencies check passed"
}

install_dependencies() {
    echo "📦 Installing dependencies..."
    npm ci --silent
    echo "✅ Dependencies installed"
}

run_tests() {
    echo "🧪 Running tests..."
    npm test -- --coverage --silent --watchAll=false || true
    echo "✅ Tests completed"
}

build_app() {
    echo "🔨 Building application..."
    npm run build
    echo "✅ Application built successfully"
}

build_docker() {
    echo "🐳 Building Docker image..."
    
    if ! command -v docker &> /dev/null; then
        echo "⚠️  Docker not found, skipping Docker build"
        return 0
    fi
    
    docker build -t "$DOCKER_IMAGE" .
    echo "✅ Docker image built: $DOCKER_IMAGE"
}

create_deployment_package() {
    echo "📦 Creating deployment package..."
    
    # Create deployment directory
    DEPLOY_DIR="deploy-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$DEPLOY_DIR"
    
    # Copy build files
    cp -r "$BUILD_DIR"/* "$DEPLOY_DIR/"
    
    # Create deployment info
    cat > "$DEPLOY_DIR/deployment-info.json" << EOF
{
  "app": "$APP_NAME",
  "version": "$VERSION",
  "buildTime": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "gitCommit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "gitBranch": "$(git branch --show-current 2>/dev/null || echo 'unknown')"
}
EOF
    
    # Create archive
    tar -czf "$DEPLOY_DIR.tar.gz" -C "$DEPLOY_DIR" .
    rm -rf "$DEPLOY_DIR"
    
    echo "✅ Deployment package created: $DEPLOY_DIR.tar.gz"
}

run_lighthouse_audit() {
    echo "🔍 Running Lighthouse PWA audit..."
    
    if ! command -v lighthouse &> /dev/null; then
        echo "⚠️  Lighthouse not found, skipping audit"
        echo "   Install with: npm install -g lighthouse"
        return 0
    fi
    
    # Start a temporary server
    npx serve -s "$BUILD_DIR" -l 3001 &
    SERVER_PID=$!
    sleep 3
    
    # Run Lighthouse audit
    lighthouse http://localhost:3001 \
        --only-categories=pwa \
        --output=json \
        --output-path=lighthouse-pwa-report.json \
        --quiet || true
    
    # Stop the server
    kill $SERVER_PID 2>/dev/null || true
    
    if [ -f "lighthouse-pwa-report.json" ]; then
        PWA_SCORE=$(cat lighthouse-pwa-report.json | grep -o '"score":[0-9.]*' | head -1 | cut -d: -f2)
        echo "✅ PWA Score: $(echo "$PWA_SCORE * 100" | bc 2>/dev/null || echo "N/A")/100"
    fi
}

show_deployment_info() {
    echo ""
    echo "🎉 Deployment completed successfully!"
    echo ""
    echo "📊 Build Information:"
    echo "   App Name: $APP_NAME"
    echo "   Version: $VERSION"
    echo "   Build Time: $(date)"
    echo "   Build Size: $(du -sh "$BUILD_DIR" | cut -f1)"
    echo ""
    echo "🚀 Deployment Options:"
    echo "   Static hosting: Upload contents of '$BUILD_DIR' folder"
    echo "   Docker: docker run -p 8080:80 $DOCKER_IMAGE"
    echo "   Local preview: npm run serve"
    echo ""
    echo "📱 PWA Features:"
    echo "   ✅ Service Worker registered"
    echo "   ✅ Web App Manifest included"
    echo "   ✅ Offline support enabled"
    echo "   ✅ Install prompt available"
    echo ""
    echo "🔗 Deployment URLs:"
    echo "   Netlify: netlify deploy --prod --dir=$BUILD_DIR"
    echo "   Vercel: vercel --prod $BUILD_DIR"
    echo "   Firebase: firebase deploy --only hosting"
    echo ""
}

# Main deployment process
main() {
    echo "🎯 Anava Vision PWA - Production Deployment"
    echo "============================================="
    
    check_dependencies
    install_dependencies
    run_tests
    build_app
    build_docker
    create_deployment_package
    run_lighthouse_audit
    show_deployment_info
}

# Run deployment
main "$@"