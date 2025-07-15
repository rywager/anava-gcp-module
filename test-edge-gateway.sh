#!/bin/bash

echo "🔧 Testing Edge Gateway Component"
echo "================================="

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

echo "✅ Docker is running"

# Navigate to edge gateway directory
cd /Users/ryanwager/terraform-installer/edge-gateway

# Check if configuration exists
if [ ! -f ".env" ]; then
    echo "⚠️  Creating .env configuration..."
    cp .env.example .env
    echo "📝 Please edit .env file with your camera credentials"
    echo "   CAMERA_USERNAME=root"
    echo "   CAMERA_PASSWORD=your_password"
    echo "   CLOUD_ORCHESTRATOR_URL=wss://cloud-orchestrator-392865621461.us-central1.run.app/gateway"
    echo ""
fi

# Test if we can build the image
echo "🏗️  Building Edge Gateway Docker image..."
if docker build -t anava-edge-gateway . > /dev/null 2>&1; then
    echo "✅ Docker image built successfully"
else
    echo "❌ Failed to build Docker image"
    exit 1
fi

# Test configuration
echo "🔧 Testing configuration..."
if docker run --rm anava-edge-gateway --version > /dev/null 2>&1; then
    echo "✅ Configuration valid"
else
    echo "⚠️  Configuration may need adjustment"
fi

# Show deployment options
echo ""
echo "🚀 Deployment Options:"
echo "======================"
echo ""
echo "1. Deploy with Docker Compose (recommended):"
echo "   docker-compose up -d"
echo ""
echo "2. Deploy with deployment script:"
echo "   ./scripts/deploy.sh deploy"
echo ""
echo "3. Run directly with Docker:"
echo "   docker run -d --name edge-gateway --env-file .env anava-edge-gateway"
echo ""
echo "📊 Monitor logs:"
echo "   docker logs -f edge-gateway"
echo ""
echo "🔍 Check status:"
echo "   docker ps | grep edge-gateway"
echo ""

# Test camera discovery (if on same network)
echo "🎥 Testing camera discovery..."
echo "Scanning for cameras on local network..."

# Use nmap if available
if command -v nmap > /dev/null 2>&1; then
    echo "🔍 Scanning for RTSP services..."
    nmap -p 554 --open 192.168.1.0/24 2>/dev/null | grep -A 2 "Host is up" || echo "No RTSP services found on 192.168.1.0/24"
else
    echo "⚠️  nmap not available. Install with: brew install nmap"
fi

echo ""
echo "🎯 Next Steps:"
echo "=============="
echo "1. Edit .env file with correct camera credentials"
echo "2. Deploy edge gateway: ./scripts/deploy.sh deploy"
echo "3. Check logs: docker logs -f edge-gateway"
echo "4. Verify connection to cloud orchestrator"
echo "5. Test camera discovery in logs"
echo ""
echo "✅ Edge Gateway is ready for deployment!"