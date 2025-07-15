#!/bin/bash
set -e

# STUN/TURN Server Deployment Script
# This script builds and deploys coturn infrastructure

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_dependencies() {
    print_status "Checking dependencies..."
    
    local missing_deps=()
    
    if ! command -v docker &> /dev/null; then
        missing_deps+=("docker")
    fi
    
    if ! command -v terraform &> /dev/null; then
        missing_deps+=("terraform")
    fi
    
    if ! command -v gcloud &> /dev/null; then
        missing_deps+=("gcloud")
    fi
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        print_error "Missing dependencies: ${missing_deps[*]}"
        print_error "Please install them before running this script."
        exit 1
    fi
    
    print_success "All dependencies found"
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
COTURN_DIR="$PROJECT_ROOT/coturn"
TERRAFORM_DIR="$PROJECT_ROOT/terraform"

# Default values
ENVIRONMENT=${ENVIRONMENT:-"dev"}
PROJECT_ID=${PROJECT_ID:-""}
REGION=${REGION:-"us-central1"}
DOMAIN=${DOMAIN:-"turn.example.com"}
DEPLOYMENT_TYPE=${DEPLOYMENT_TYPE:-"compute"}  # compute or cloud-run

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --project-id)
            PROJECT_ID="$2"
            shift 2
            ;;
        --environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        --region)
            REGION="$2"
            shift 2
            ;;
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --type)
            DEPLOYMENT_TYPE="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --project-id    GCP Project ID"
            echo "  --environment   Environment (dev/staging/prod)"
            echo "  --region        GCP Region"
            echo "  --domain        Domain for TURN server"
            echo "  --type          Deployment type (compute/cloud-run)"
            echo "  --help          Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate required parameters
if [ -z "$PROJECT_ID" ]; then
    print_error "PROJECT_ID is required. Use --project-id or set environment variable."
    exit 1
fi

print_status "Starting deployment with configuration:"
echo "  Project ID: $PROJECT_ID"
echo "  Environment: $ENVIRONMENT"
echo "  Region: $REGION"
echo "  Domain: $DOMAIN"
echo "  Deployment Type: $DEPLOYMENT_TYPE"

# Authenticate with GCP
authenticate_gcp() {
    print_status "Authenticating with GCP..."
    
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
        print_warning "No active GCP authentication found. Please authenticate:"
        gcloud auth login
    fi
    
    gcloud config set project "$PROJECT_ID"
    print_success "GCP authentication configured"
}

# Enable required APIs
enable_apis() {
    print_status "Enabling required GCP APIs..."
    
    local apis=(
        "compute.googleapis.com"
        "sql-component.googleapis.com"
        "redis.googleapis.com"
        "artifactregistry.googleapis.com"
        "logging.googleapis.com"
        "monitoring.googleapis.com"
    )
    
    if [ "$DEPLOYMENT_TYPE" = "cloud-run" ]; then
        apis+=("run.googleapis.com" "vpcaccess.googleapis.com")
    fi
    
    for api in "${apis[@]}"; do
        print_status "Enabling $api..."
        gcloud services enable "$api" --project="$PROJECT_ID"
    done
    
    print_success "APIs enabled"
}

# Build and push Docker image
build_and_push_image() {
    print_status "Building and pushing coturn Docker image..."
    
    cd "$COTURN_DIR"
    
    # Create Artifact Registry repository
    local repo_name="coturn-$ENVIRONMENT"
    local image_url="$REGION-docker.pkg.dev/$PROJECT_ID/$repo_name/coturn:latest"
    
    # Create repository if it doesn't exist
    if ! gcloud artifacts repositories describe "$repo_name" --location="$REGION" --project="$PROJECT_ID" &>/dev/null; then
        print_status "Creating Artifact Registry repository..."
        gcloud artifacts repositories create "$repo_name" \
            --repository-format=docker \
            --location="$REGION" \
            --project="$PROJECT_ID"
    fi
    
    # Configure Docker authentication
    gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet
    
    # Build image
    print_status "Building Docker image..."
    docker build -t "$image_url" .
    
    # Push image
    print_status "Pushing Docker image..."
    docker push "$image_url"
    
    print_success "Docker image built and pushed: $image_url"
    
    cd "$PROJECT_ROOT"
}

# Deploy infrastructure with Terraform
deploy_infrastructure() {
    print_status "Deploying infrastructure with Terraform..."
    
    cd "$TERRAFORM_DIR"
    
    # Initialize Terraform
    terraform init -upgrade
    
    # Create terraform.tfvars
    cat > terraform.tfvars << EOF
project_id    = "$PROJECT_ID"
environment   = "$ENVIRONMENT"
region        = "$REGION"
domain        = "$DOMAIN"
enable_cloud_run = $([ "$DEPLOYMENT_TYPE" = "cloud-run" ] && echo "true" || echo "false")
EOF
    
    # Plan deployment
    print_status "Planning Terraform deployment..."
    terraform plan -var-file=terraform.tfvars
    
    # Apply deployment
    print_status "Applying Terraform deployment..."
    terraform apply -var-file=terraform.tfvars -auto-approve
    
    # Extract outputs
    TURN_IP=$(terraform output -raw turn_server_ip 2>/dev/null || echo "")
    TURN_SECRET=$(terraform output -raw turn_secret 2>/dev/null || echo "")
    
    print_success "Infrastructure deployed successfully"
    
    if [ -n "$TURN_IP" ] && [ -n "$TURN_SECRET" ]; then
        echo ""
        echo "=== DEPLOYMENT SUMMARY ==="
        echo "TURN Server IP: $TURN_IP"
        echo "TURN Secret: $TURN_SECRET"
        echo ""
        echo "WebRTC Configuration:"
        terraform output -raw webrtc_config | jq .
        echo ""
        echo "Save these credentials securely!"
        echo "=========================="
    fi
    
    cd "$PROJECT_ROOT"
}

# Test deployment
test_deployment() {
    print_status "Testing STUN/TURN server deployment..."
    
    local turn_ip
    turn_ip=$(cd "$TERRAFORM_DIR" && terraform output -raw turn_server_ip 2>/dev/null || echo "")
    
    if [ -z "$turn_ip" ]; then
        print_warning "Could not get TURN server IP from Terraform output"
        return
    fi
    
    # Test STUN connectivity
    print_status "Testing STUN connectivity to $turn_ip:3478..."
    if command -v nc &> /dev/null; then
        if timeout 5 nc -u -z "$turn_ip" 3478; then
            print_success "STUN server is reachable"
        else
            print_warning "STUN server may not be ready yet (this is normal for new deployments)"
        fi
    else
        print_warning "netcat not available, skipping connectivity test"
    fi
    
    # Wait for instances to be ready
    print_status "Waiting for instances to be ready..."
    sleep 30
    
    print_success "Deployment test completed"
}

# Create test client
create_test_client() {
    print_status "Creating test client script..."
    
    local test_script="$PROJECT_ROOT/test-webrtc.html"
    
    cat > "$test_script" << 'EOF'
<!DOCTYPE html>
<html>
<head>
    <title>WebRTC STUN/TURN Test</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .success { color: green; }
        .error { color: red; }
        .info { color: blue; }
        pre { background: #f5f5f5; padding: 10px; border-radius: 4px; }
    </style>
</head>
<body>
    <h1>WebRTC STUN/TURN Server Test</h1>
    
    <div id="config">
        <h3>Configuration:</h3>
        <textarea id="iceServers" rows="10" cols="80" placeholder="Paste your WebRTC configuration here..."></textarea>
        <br><br>
        <button onclick="testServers()">Test STUN/TURN Servers</button>
    </div>
    
    <div id="results">
        <h3>Test Results:</h3>
        <div id="output"></div>
    </div>

    <script>
        function log(message, type = 'info') {
            const output = document.getElementById('output');
            const div = document.createElement('div');
            div.className = type;
            div.innerHTML = new Date().toLocaleTimeString() + ': ' + message;
            output.appendChild(div);
        }

        async function testServers() {
            const configText = document.getElementById('iceServers').value;
            if (!configText.trim()) {
                log('Please enter ICE servers configuration', 'error');
                return;
            }

            try {
                const config = JSON.parse(configText);
                log('Starting STUN/TURN server test...', 'info');
                
                const pc = new RTCPeerConnection(config);
                
                // Add a data channel to trigger ICE gathering
                pc.createDataChannel('test');
                
                pc.onicecandidate = (event) => {
                    if (event.candidate) {
                        log(`ICE Candidate: ${event.candidate.candidate}`, 'success');
                    } else {
                        log('ICE gathering completed', 'info');
                    }
                };
                
                pc.onicegatheringstatechange = () => {
                    log(`ICE gathering state: ${pc.iceGatheringState}`, 'info');
                };
                
                pc.oniceconnectionstatechange = () => {
                    log(`ICE connection state: ${pc.iceConnectionState}`, 'info');
                };
                
                // Create offer to start ICE gathering
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                
                log('Test initiated. Check the candidates above to verify STUN/TURN is working.', 'success');
                
            } catch (error) {
                log(`Error: ${error.message}`, 'error');
            }
        }

        // Example configuration
        document.addEventListener('DOMContentLoaded', () => {
            const example = {
                iceServers: [
                    { urls: 'stun:YOUR_TURN_SERVER_IP:3478' },
                    {
                        urls: ['turn:YOUR_TURN_SERVER_IP:3478', 'turns:YOUR_TURN_SERVER_IP:5349'],
                        username: 'webrtc',
                        credential: 'YOUR_TURN_SECRET'
                    }
                ]
            };
            
            document.getElementById('iceServers').value = JSON.stringify(example, null, 2);
        });
    </script>
</body>
</html>
EOF
    
    print_success "Test client created: $test_script"
    print_status "Open this file in a browser to test your STUN/TURN servers"
}

# Main deployment flow
main() {
    print_status "Starting STUN/TURN server deployment..."
    
    check_dependencies
    authenticate_gcp
    enable_apis
    build_and_push_image
    deploy_infrastructure
    test_deployment
    create_test_client
    
    print_success "Deployment completed successfully!"
    print_status "Next steps:"
    echo "1. Update your WebRTC application with the new server configuration"
    echo "2. Test connectivity using the generated test client"
    echo "3. Monitor server performance in GCP Console"
    echo "4. Configure SSL certificates for production use"
}

# Run main function
main "$@"