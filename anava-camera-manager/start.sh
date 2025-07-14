#!/bin/bash

echo "🚀 Starting Anava Camera Manager..."

# Check if build exists
if [ ! -d "dist" ]; then
    echo "📦 Building application..."
    npm run build
fi

# Test camera connectivity first
echo "🔍 Testing camera connectivity..."
node test-discovery.js

echo ""
echo "🖥️  Starting Electron application..."
echo "   - Camera discovery will run automatically"
echo "   - Check the test camera at 192.168.50.156"
echo "   - Use the network topology view for visual representation"
echo ""

npm run electron