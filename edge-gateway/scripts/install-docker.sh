#!/bin/bash

# Docker Installation Script for Edge Gateway
# Supports Ubuntu, Debian, Raspberry Pi OS, and other Linux distributions

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Detect OS and architecture
detect_system() {
    log "Detecting system information..."
    
    if [ -f /etc/os-release ]; then
        . /etc/os-release
        OS=$ID
        OS_VERSION=$VERSION_ID
    else
        error "Cannot detect OS. /etc/os-release not found."
    fi
    
    ARCH=$(uname -m)
    
    log "Detected OS: $OS $OS_VERSION"
    log "Detected Architecture: $ARCH"
    
    # Check if Raspberry Pi
    if grep -q "Raspberry Pi" /proc/device-tree/model 2>/dev/null; then
        IS_RPI=true
        log "Raspberry Pi detected"
    else
        IS_RPI=false
    fi
}

# Check if Docker is already installed
check_docker() {
    if command -v docker &> /dev/null; then
        DOCKER_VERSION=$(docker --version | cut -d' ' -f3 | cut -d',' -f1)
        log "Docker is already installed (version $DOCKER_VERSION)"
        
        if command -v docker-compose &> /dev/null; then
            COMPOSE_VERSION=$(docker-compose --version | cut -d' ' -f3 | cut -d',' -f1)
            log "Docker Compose is already installed (version $COMPOSE_VERSION)"
            
            # Check if user is in docker group
            if groups $USER | grep -q '\bdocker\b'; then
                success "Docker is properly configured for user $USER"
                return 0
            else
                warn "User $USER is not in docker group"
                return 1
            fi
        else
            warn "Docker Compose is not installed"
            return 1
        fi
    else
        log "Docker is not installed"
        return 1
    fi
}

# Install Docker on Ubuntu/Debian
install_docker_debian() {
    log "Installing Docker on Debian/Ubuntu..."
    
    # Update package index
    sudo apt-get update
    
    # Install prerequisites
    sudo apt-get install -y \
        apt-transport-https \
        ca-certificates \
        curl \
        gnupg \
        lsb-release
    
    # Add Docker GPG key
    curl -fsSL https://download.docker.com/linux/$OS/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Add Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/$OS $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Update package index again
    sudo apt-get update
    
    # Install Docker
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io
    
    success "Docker installed successfully"
}

# Install Docker Compose
install_docker_compose() {
    log "Installing Docker Compose..."
    
    # Get latest version
    COMPOSE_VERSION=$(curl -s https://api.github.com/repos/docker/compose/releases/latest | grep -Po '"tag_name": "\K.*?(?=")')
    
    # Download and install
    sudo curl -L "https://github.com/docker/compose/releases/download/${COMPOSE_VERSION}/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    
    # Create symlink if needed
    if [ ! -f /usr/bin/docker-compose ]; then
        sudo ln -s /usr/local/bin/docker-compose /usr/bin/docker-compose
    fi
    
    success "Docker Compose $COMPOSE_VERSION installed successfully"
}

# Configure Docker for user
configure_docker() {
    log "Configuring Docker for user $USER..."
    
    # Add user to docker group
    sudo usermod -aG docker $USER
    
    # Start and enable Docker service
    sudo systemctl start docker
    sudo systemctl enable docker
    
    success "Docker configured successfully"
    warn "Please log out and log back in for group changes to take effect, or run: newgrp docker"
}

# Optimize Docker for Raspberry Pi
optimize_for_rpi() {
    if [ "$IS_RPI" = false ]; then
        return
    fi
    
    log "Optimizing Docker for Raspberry Pi..."
    
    # Create daemon.json for optimization
    sudo mkdir -p /etc/docker
    
    cat << EOF | sudo tee /etc/docker/daemon.json
{
    "storage-driver": "overlay2",
    "log-driver": "json-file",
    "log-opts": {
        "max-size": "10m",
        "max-file": "3"
    },
    "default-runtime": "runc",
    "runtimes": {
        "runc": {
            "path": "runc"
        }
    }
}
EOF
    
    # Enable memory cgroup (required for some containers)
    if ! grep -q "cgroup_enable=memory" /boot/cmdline.txt; then
        sudo sed -i 's/$/ cgroup_enable=memory cgroup_memory=1/' /boot/cmdline.txt
        warn "Memory cgroup enabled. Reboot required for changes to take effect."
    fi
    
    success "Raspberry Pi optimizations applied"
}

# Test Docker installation
test_docker() {
    log "Testing Docker installation..."
    
    # Test Docker
    if docker run --rm hello-world > /dev/null 2>&1; then
        success "Docker test passed"
    else
        error "Docker test failed"
    fi
    
    # Test Docker Compose
    if docker-compose --version > /dev/null 2>&1; then
        success "Docker Compose test passed"
    else
        error "Docker Compose test failed"
    fi
}

# Main installation function
main() {
    log "Docker Installation Script for Edge Gateway"
    log "=========================================="
    
    # Check if running as root
    if [ "$EUID" -eq 0 ]; then
        error "This script should not be run as root. Run as a regular user with sudo privileges."
    fi
    
    detect_system
    
    if check_docker; then
        log "Docker is already properly installed and configured"
        exit 0
    fi
    
    case $OS in
        ubuntu|debian|raspbian)
            install_docker_debian
            ;;
        *)
            error "Unsupported OS: $OS. Please install Docker manually."
            ;;
    esac
    
    install_docker_compose
    configure_docker
    optimize_for_rpi
    
    # Wait a moment for services to start
    sleep 5
    
    # Test installation
    if groups $USER | grep -q '\bdocker\b'; then
        test_docker
    else
        warn "Cannot test Docker without logging out and back in first"
    fi
    
    success "Docker installation completed successfully!"
    echo ""
    log "Next steps:"
    echo "1. Log out and log back in (or run 'newgrp docker')"
    echo "2. Run './scripts/deploy.sh deploy' to deploy the Edge Gateway"
    
    if [ "$IS_RPI" = true ] && grep -q "cgroup_enable=memory" /boot/cmdline.txt; then
        echo "3. Reboot your Raspberry Pi to enable memory cgroup"
    fi
}

# Run main function
main "$@"