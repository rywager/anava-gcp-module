#!/bin/bash

# Edge Gateway Deployment Script
# This script handles deployment on various platforms

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_DIR/.env"
COMPOSE_FILE="$PROJECT_DIR/docker-compose.yml"

# Default values
PLATFORM=""
ACTION="deploy"
SKIP_BUILD=false
VERBOSE=false

# Helper functions
log() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

usage() {
    cat << EOF
Edge Gateway Deployment Script

Usage: $0 [OPTIONS] [ACTION]

ACTIONS:
    deploy      Deploy the gateway service (default)
    stop        Stop the gateway service
    restart     Restart the gateway service
    status      Show service status
    logs        Show service logs
    update      Update the service to latest version
    remove      Remove the service completely

OPTIONS:
    -p, --platform PLATFORM    Target platform (auto-detect if not specified)
                               Options: raspberry-pi, linux, docker
    -s, --skip-build           Skip building Docker image
    -v, --verbose              Enable verbose output
    -h, --help                 Show this help message

EXAMPLES:
    $0 deploy                  # Deploy on auto-detected platform
    $0 -p raspberry-pi deploy  # Deploy specifically for Raspberry Pi
    $0 stop                    # Stop the service
    $0 logs                    # View service logs
    $0 update                  # Update to latest version

EOF
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--platform)
            PLATFORM="$2"
            shift 2
            ;;
        -s|--skip-build)
            SKIP_BUILD=true
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        deploy|stop|restart|status|logs|update|remove)
            ACTION="$1"
            shift
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Enable verbose output if requested
if [ "$VERBOSE" = true ]; then
    set -x
fi

# Detect platform if not specified
detect_platform() {
    if [ -n "$PLATFORM" ]; then
        return
    fi

    log "Auto-detecting platform..."
    
    if grep -q "Raspberry Pi" /proc/device-tree/model 2>/dev/null; then
        PLATFORM="raspberry-pi"
    elif command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
        PLATFORM="docker"
    elif [ "$(uname)" = "Linux" ]; then
        PLATFORM="linux"
    else
        error "Unable to detect platform. Please specify with -p option."
    fi
    
    log "Detected platform: $PLATFORM"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites for platform: $PLATFORM"
    
    case $PLATFORM in
        raspberry-pi|docker|linux)
            if ! command -v docker &> /dev/null; then
                error "Docker is required but not installed. Please install Docker first."
            fi
            
            if ! command -v docker-compose &> /dev/null; then
                error "Docker Compose is required but not installed. Please install Docker Compose first."
            fi
            ;;
        *)
            error "Unsupported platform: $PLATFORM"
            ;;
    esac
    
    # Check if running as root (warn if yes)
    if [ "$EUID" -eq 0 ]; then
        warn "Running as root. Consider running as a regular user with Docker group membership."
    fi
    
    success "Prerequisites check passed"
}

# Setup environment
setup_environment() {
    log "Setting up environment..."
    
    cd "$PROJECT_DIR"
    
    if [ ! -f "$ENV_FILE" ]; then
        log "Creating .env file from template..."
        cp .env.example .env
        warn "Please edit .env file with your configuration before deployment"
        
        # Prompt for basic configuration
        read -p "Enter Cloud Orchestrator URL (or press Enter for default): " cloud_url
        if [ -n "$cloud_url" ]; then
            sed -i "s|^CLOUD_ORCHESTRATOR_URL=.*|CLOUD_ORCHESTRATOR_URL=$cloud_url|" .env
        fi
        
        read -p "Enter camera username (or press Enter for 'root'): " cam_user
        if [ -n "$cam_user" ]; then
            sed -i "s|^CAMERA_USERNAME=.*|CAMERA_USERNAME=$cam_user|" .env
        fi
        
        read -p "Enter camera password (or press Enter for 'pass'): " cam_pass
        if [ -n "$cam_pass" ]; then
            sed -i "s|^CAMERA_PASSWORD=.*|CAMERA_PASSWORD=$cam_pass|" .env
        fi
    fi
    
    success "Environment setup complete"
}

# Build Docker image
build_image() {
    if [ "$SKIP_BUILD" = true ]; then
        log "Skipping Docker image build"
        return
    fi
    
    log "Building Docker image for platform: $PLATFORM"
    
    case $PLATFORM in
        raspberry-pi)
            docker buildx build --platform linux/arm64 -t edge-gateway:latest .
            ;;
        linux|docker)
            docker build -t edge-gateway:latest .
            ;;
    esac
    
    success "Docker image build complete"
}

# Deploy service
deploy_service() {
    log "Deploying edge gateway service..."
    
    # Ensure network is available (host networking)
    docker-compose up -d
    
    # Wait for service to be ready
    log "Waiting for service to start..."
    sleep 10
    
    # Check if service is running
    if docker-compose ps | grep -q "Up"; then
        success "Edge gateway service deployed successfully"
        show_status
    else
        error "Service failed to start. Check logs with: $0 logs"
    fi
}

# Stop service
stop_service() {
    log "Stopping edge gateway service..."
    docker-compose down
    success "Service stopped"
}

# Restart service
restart_service() {
    log "Restarting edge gateway service..."
    docker-compose restart
    success "Service restarted"
}

# Show status
show_status() {
    log "Service status:"
    docker-compose ps
    echo ""
    
    # Show recent logs
    log "Recent logs (last 10 lines):"
    docker-compose logs --tail=10 edge-gateway 2>/dev/null || warn "Service not running"
}

# Show logs
show_logs() {
    log "Showing service logs (press Ctrl+C to exit):"
    docker-compose logs -f edge-gateway
}

# Update service
update_service() {
    log "Updating edge gateway service..."
    
    # Pull latest image or rebuild
    if [ "$SKIP_BUILD" = false ]; then
        build_image
    fi
    
    # Restart with new image
    docker-compose up -d --force-recreate
    
    success "Service updated successfully"
}

# Remove service
remove_service() {
    warn "This will completely remove the edge gateway service and its data."
    read -p "Are you sure? (y/N): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        log "Removing edge gateway service..."
        docker-compose down --rmi local --volumes --remove-orphans
        success "Service removed completely"
    else
        log "Operation cancelled"
    fi
}

# Install as system service (systemd)
install_systemd_service() {
    if [ "$PLATFORM" != "raspberry-pi" ] && [ "$PLATFORM" != "linux" ]; then
        warn "Systemd service installation only supported on Linux platforms"
        return
    fi
    
    log "Installing systemd service..."
    
    cat > /tmp/edge-gateway.service << EOF
[Unit]
Description=Edge Gateway Service
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/local/bin/docker-compose up -d
ExecStop=/usr/local/bin/docker-compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF
    
    sudo mv /tmp/edge-gateway.service /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl enable edge-gateway.service
    
    success "Systemd service installed. Start with: sudo systemctl start edge-gateway"
}

# Main execution
main() {
    log "Edge Gateway Deployment Script"
    log "Action: $ACTION"
    
    detect_platform
    check_prerequisites
    
    case $ACTION in
        deploy)
            setup_environment
            build_image
            deploy_service
            ;;
        stop)
            stop_service
            ;;
        restart)
            restart_service
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs
            ;;
        update)
            update_service
            ;;
        remove)
            remove_service
            ;;
        *)
            error "Unknown action: $ACTION"
            ;;
    esac
}

# Run main function
main "$@"