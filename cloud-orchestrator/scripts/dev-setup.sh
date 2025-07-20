#!/bin/bash

# Development Setup Script for Cloud Orchestrator
set -e

echo "Setting up Cloud Orchestrator for local development..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt "18" ]; then
    echo "Error: Node.js version 18+ required. Current version: $(node --version)"
    exit 1
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file from template..."
    cp .env.example .env
    echo "✅ Created .env file. Please edit it with your configuration."
else
    echo "✅ .env file already exists"
fi

# Check if Firebase service account is configured
if [ -z "$GOOGLE_APPLICATION_CREDENTIALS" ] && [ ! -f "service-account.json" ]; then
    echo "⚠️  Warning: Firebase service account not configured"
    echo "   Please either:"
    echo "   1. Set GOOGLE_APPLICATION_CREDENTIALS environment variable"
    echo "   2. Place service-account.json in the project root"
    echo "   3. Run 'gcloud auth application-default login' for development"
fi

# Create logs directory
mkdir -p logs

# Run tests to verify setup
echo "Running tests..."
npm test

echo ""
echo "🎉 Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your Firebase project configuration"
echo "2. Set up Firebase service account credentials"
echo "3. Start development server: npm run dev"
echo "4. Test health endpoint: curl http://localhost:8080/health"
echo ""
echo "For deployment:"
echo "1. Configure gcloud CLI: gcloud auth login"
echo "2. Run deployment script: ./deployment/deploy.sh"