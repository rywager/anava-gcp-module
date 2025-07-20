#!/bin/bash
set -e

# STUN/TURN Server Monitoring and Management Script

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

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TERRAFORM_DIR="$PROJECT_ROOT/terraform"

# Default values
ENVIRONMENT=${ENVIRONMENT:-"dev"}
PROJECT_ID=${PROJECT_ID:-""}
REGION=${REGION:-"us-central1"}

# Parse command line arguments
COMMAND=""
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
        status|logs|scale|restart|test|cleanup)
            COMMAND="$1"
            shift
            ;;
        --help)
            echo "Usage: $0 <command> [OPTIONS]"
            echo "Commands:"
            echo "  status      Show deployment status"
            echo "  logs        Show server logs"
            echo "  scale       Scale instance group"
            echo "  restart     Restart instances"
            echo "  test        Test STUN/TURN connectivity"
            echo "  cleanup     Clean up resources"
            echo ""
            echo "Options:"
            echo "  --project-id    GCP Project ID"
            echo "  --environment   Environment (dev/staging/prod)"
            echo "  --region        GCP Region"
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

if [ -z "$COMMAND" ]; then
    print_error "Command is required. Use --help for available commands."
    exit 1
fi

# Set GCP project
gcloud config set project "$PROJECT_ID" --quiet

# Get Terraform outputs
get_terraform_output() {
    local key="$1"
    cd "$TERRAFORM_DIR"
    terraform output -raw "$key" 2>/dev/null || echo ""
}

# Show deployment status
show_status() {
    print_status "Checking STUN/TURN deployment status..."
    
    local turn_ip
    turn_ip=$(get_terraform_output "turn_server_ip")
    
    if [ -z "$turn_ip" ]; then
        print_error "No deployment found. Run deploy.sh first."
        return 1
    fi
    
    echo ""
    echo "=== DEPLOYMENT STATUS ==="
    echo "Environment: $ENVIRONMENT"
    echo "Project: $PROJECT_ID"
    echo "Region: $REGION"
    echo "TURN Server IP: $turn_ip"
    echo ""
    
    # Check instance group status
    local mig_name="coturn-mig-$ENVIRONMENT"
    print_status "Checking managed instance group: $mig_name"
    
    if gcloud compute instance-groups managed describe "$mig_name" --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
        local target_size current_size
        target_size=$(gcloud compute instance-groups managed describe "$mig_name" --region="$REGION" --project="$PROJECT_ID" --format="value(targetSize)")
        current_size=$(gcloud compute instance-groups managed describe "$mig_name" --region="$REGION" --project="$PROJECT_ID" --format="value(currentActions.creating,currentActions.none)" | tr ',' '+' | bc 2>/dev/null || echo "0")
        
        echo "Target instances: $target_size"
        echo "Current instances: $current_size"
        
        # List instances
        print_status "Instance details:"
        gcloud compute instance-groups managed list-instances "$mig_name" --region="$REGION" --project="$PROJECT_ID" --format="table(name,status,instanceStatus)"
    else
        print_warning "Managed instance group not found"
    fi
    
    # Check load balancer
    local lb_ip="coturn-ip-$ENVIRONMENT"
    if gcloud compute addresses describe "$lb_ip" --global --project="$PROJECT_ID" &>/dev/null; then
        local lb_address
        lb_address=$(gcloud compute addresses describe "$lb_ip" --global --project="$PROJECT_ID" --format="value(address)")
        echo "Load balancer IP: $lb_address"
    fi
    
    # Check database
    local db_name="coturn-db-$ENVIRONMENT"
    if gcloud sql instances describe "$db_name" --project="$PROJECT_ID" &>/dev/null; then
        local db_status
        db_status=$(gcloud sql instances describe "$db_name" --project="$PROJECT_ID" --format="value(state)")
        echo "Database status: $db_status"
    fi
    
    # Check Redis
    local redis_name="coturn-cache-$ENVIRONMENT"
    if gcloud redis instances describe "$redis_name" --region="$REGION" --project="$PROJECT_ID" &>/dev/null; then
        local redis_status
        redis_status=$(gcloud redis instances describe "$redis_name" --region="$REGION" --project="$PROJECT_ID" --format="value(state)")
        echo "Redis status: $redis_status"
    fi
    
    echo "========================="
}

# Show server logs
show_logs() {
    print_status "Fetching STUN/TURN server logs..."
    
    local mig_name="coturn-mig-$ENVIRONMENT"
    
    # Get instance names
    local instances
    instances=$(gcloud compute instance-groups managed list-instances "$mig_name" --region="$REGION" --project="$PROJECT_ID" --format="value(instance)" 2>/dev/null | head -3)
    
    if [ -z "$instances" ]; then
        print_error "No instances found"
        return 1
    fi
    
    for instance in $instances; do
        local zone
        zone=$(gcloud compute instances list --filter="name:$instance" --format="value(zone)" --project="$PROJECT_ID")
        
        print_status "Logs from instance: $instance (zone: $zone)"
        echo "----------------------------------------"
        
        # Get logs from the instance
        gcloud compute ssh "$instance" --zone="$zone" --project="$PROJECT_ID" --command="sudo docker logs \$(sudo docker ps -q --filter ancestor=*coturn*) --tail=50" 2>/dev/null || {
            print_warning "Could not fetch logs from $instance"
        }
        
        echo ""
    done
}

# Scale instance group
scale_instances() {
    print_status "Scaling instance group..."
    
    local mig_name="coturn-mig-$ENVIRONMENT"
    local new_size="${1:-3}"
    
    print_status "Scaling $mig_name to $new_size instances..."
    
    gcloud compute instance-groups managed resize "$mig_name" \
        --size="$new_size" \
        --region="$REGION" \
        --project="$PROJECT_ID"
    
    print_success "Scaling initiated. Use 'status' command to check progress."
}

# Restart instances
restart_instances() {
    print_status "Restarting STUN/TURN instances..."
    
    local mig_name="coturn-mig-$ENVIRONMENT"
    
    print_status "Performing rolling restart of $mig_name..."
    
    gcloud compute instance-groups managed rolling-action restart "$mig_name" \
        --region="$REGION" \
        --project="$PROJECT_ID" \
        --max-surge=1 \
        --max-unavailable=0
    
    print_success "Rolling restart initiated. This may take several minutes."
}

# Test connectivity
test_connectivity() {
    print_status "Testing STUN/TURN connectivity..."
    
    local turn_ip
    turn_ip=$(get_terraform_output "turn_server_ip")
    
    if [ -z "$turn_ip" ]; then
        print_error "No deployment found"
        return 1
    fi
    
    # Test STUN port
    print_status "Testing STUN port 3478..."
    if timeout 5 nc -u -z "$turn_ip" 3478 2>/dev/null; then
        print_success "STUN port 3478 is reachable"
    else
        print_error "STUN port 3478 is not reachable"
    fi
    
    # Test TURNS port
    print_status "Testing TURNS port 5349..."
    if timeout 5 nc -z "$turn_ip" 5349 2>/dev/null; then
        print_success "TURNS port 5349 is reachable"
    else
        print_error "TURNS port 5349 is not reachable"
    fi
    
    # Test alternative ports
    print_status "Testing alternative port 8080..."
    if timeout 5 nc -u -z "$turn_ip" 8080 2>/dev/null; then
        print_success "Alternative port 8080 is reachable"
    else
        print_warning "Alternative port 8080 is not reachable"
    fi
    
    # Advanced test with WebRTC if available
    if command -v node &> /dev/null; then
        print_status "Running WebRTC connectivity test..."
        
        local turn_secret
        turn_secret=$(get_terraform_output "turn_secret")
        
        # Create a simple Node.js test
        cat > /tmp/webrtc-test.js << EOF
const { RTCPeerConnection } = require('wrtc');

const config = {
    iceServers: [
        { urls: 'stun:$turn_ip:3478' },
        {
            urls: ['turn:$turn_ip:3478'],
            username: 'test',
            credential: '$turn_secret'
        }
    ]
};

const pc = new RTCPeerConnection(config);
pc.createDataChannel('test');

let candidateCount = 0;
pc.onicecandidate = (event) => {
    if (event.candidate) {
        candidateCount++;
        console.log('ICE Candidate:', event.candidate.candidate);
    } else {
        console.log('ICE gathering completed. Total candidates:', candidateCount);
        if (candidateCount > 0) {
            console.log('SUCCESS: STUN/TURN server is working');
            process.exit(0);
        } else {
            console.log('ERROR: No ICE candidates generated');
            process.exit(1);
        }
    }
};

pc.createOffer().then(offer => pc.setLocalDescription(offer));

setTimeout(() => {
    console.log('TIMEOUT: ICE gathering took too long');
    process.exit(1);
}, 10000);
EOF
        
        if npm list wrtc &>/dev/null || npm install wrtc &>/dev/null; then
            node /tmp/webrtc-test.js
        else
            print_warning "Could not install wrtc module for advanced testing"
        fi
        
        rm -f /tmp/webrtc-test.js
    else
        print_warning "Node.js not available for advanced WebRTC testing"
    fi
}

# Clean up resources
cleanup_resources() {
    print_warning "This will destroy all STUN/TURN infrastructure!"
    read -p "Are you sure? (yes/no): " -r
    
    if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
        print_status "Cleanup cancelled"
        return 0
    fi
    
    print_status "Destroying infrastructure..."
    
    cd "$TERRAFORM_DIR"
    
    if [ -f "terraform.tfstate" ]; then
        terraform destroy -auto-approve
        print_success "Infrastructure destroyed"
    else
        print_warning "No Terraform state found"
    fi
    
    # Clean up any remaining resources
    print_status "Cleaning up any remaining resources..."
    
    # Remove any orphaned firewall rules
    local fw_rules
    fw_rules=$(gcloud compute firewall-rules list --filter="name:coturn-*-$ENVIRONMENT" --format="value(name)" --project="$PROJECT_ID" 2>/dev/null || echo "")
    
    for rule in $fw_rules; do
        print_status "Removing firewall rule: $rule"
        gcloud compute firewall-rules delete "$rule" --project="$PROJECT_ID" --quiet
    done
    
    print_success "Cleanup completed"
}

# Main execution
case $COMMAND in
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    scale)
        scale_instances "$2"
        ;;
    restart)
        restart_instances
        ;;
    test)
        test_connectivity
        ;;
    cleanup)
        cleanup_resources
        ;;
    *)
        print_error "Unknown command: $COMMAND"
        exit 1
        ;;
esac