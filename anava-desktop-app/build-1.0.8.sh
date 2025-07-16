#!/bin/bash

echo "=== Building Anava Vision Desktop v1.0.8 ==="
echo ""
echo "This version includes:"
echo "✅ Fixed camera validation - cameras will now show proper model/type"
echo "✅ Fixed ACAP deployment availability"
echo "✅ Fixed authentication status updates"
echo ""

# Build the app
npm run build-mac

echo ""
echo "Build complete! Check dist/ folder for:"
echo "- Anava Vision-1.0.8-arm64.dmg (Apple Silicon)"
echo "- Anava Vision-1.0.8.dmg (Intel)"