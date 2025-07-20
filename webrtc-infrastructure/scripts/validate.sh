#!/bin/bash
set -e

# WebRTC STUN/TURN Infrastructure Validation Script

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() { echo -e "${BLUE}[INFO]${NC} $1"; }
print_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
print_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
print_error() { echo -e "${RED}[ERROR]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

print_status "Validating WebRTC STUN/TURN infrastructure setup..."

# Check required files
check_files() {
    print_status "Checking required files..."
    
    local files=(
        "$PROJECT_ROOT/coturn/Dockerfile"
        "$PROJECT_ROOT/coturn/turnserver.conf"
        "$PROJECT_ROOT/coturn/docker-entrypoint.sh"
        "$PROJECT_ROOT/terraform/main.tf"
        "$PROJECT_ROOT/scripts/deploy.sh"
        "$PROJECT_ROOT/scripts/monitor.sh"
    )
    
    local missing=0
    for file in "${files[@]}"; do
        if [ -f "$file" ]; then
            print_success "Found: $(basename "$file")"
        else
            print_error "Missing: $file"
            missing=$((missing + 1))
        fi
    done
    
    if [ $missing -eq 0 ]; then
        print_success "All required files present"
    else
        print_error "$missing files missing"
        return 1
    fi
}

# Check dependencies
check_dependencies() {
    print_status "Checking dependencies..."
    
    local deps=(
        "docker:Docker"
        "terraform:Terraform"
        "gcloud:Google Cloud CLI"
        "openssl:OpenSSL"
    )
    
    local missing=0
    for dep in "${deps[@]}"; do
        local cmd="${dep%:*}"
        local name="${dep#*:}"
        
        if command -v "$cmd" &> /dev/null; then
            local version=$(${cmd} --version 2>/dev/null | head -1 || echo "unknown")
            print_success "$name: $version"
        else
            print_error "$name not found"
            missing=$((missing + 1))
        fi
    done
    
    if [ $missing -eq 0 ]; then
        print_success "All dependencies available"
    else
        print_error "$missing dependencies missing"
        return 1
    fi
}

# Validate Docker configuration
validate_docker() {
    print_status "Validating Docker setup..."
    
    cd "$PROJECT_ROOT/coturn"
    
    # Check if Dockerfile builds
    if docker build -t coturn-test . &>/dev/null; then
        print_success "Docker image builds successfully"
        docker rmi coturn-test &>/dev/null || true
    else
        print_error "Docker build failed"
        return 1
    fi
    
    # Validate docker-compose.yml
    if docker-compose config &>/dev/null; then
        print_success "Docker Compose configuration valid"
    else
        print_error "Docker Compose configuration invalid"
        return 1
    fi
}

# Validate Terraform configuration
validate_terraform() {
    print_status "Validating Terraform configuration..."
    
    cd "$PROJECT_ROOT/terraform"
    
    # Initialize Terraform
    if terraform init -backend=false &>/dev/null; then
        print_success "Terraform initialization successful"
    else
        print_error "Terraform initialization failed"
        return 1
    fi
    
    # Validate configuration
    if terraform validate &>/dev/null; then
        print_success "Terraform configuration valid"
    else
        print_error "Terraform configuration invalid"
        return 1
    fi
    
    # Check for required variables
    local required_vars=("project_id")
    local missing_vars=0
    
    for var in "${required_vars[@]}"; do
        if grep -q "variable \"$var\"" *.tf; then
            print_success "Required variable '$var' defined"
        else
            print_error "Required variable '$var' missing"
            missing_vars=$((missing_vars + 1))
        fi
    done
    
    if [ $missing_vars -gt 0 ]; then
        return 1
    fi
}

# Validate scripts
validate_scripts() {
    print_status "Validating scripts..."
    
    local scripts=(
        "$PROJECT_ROOT/scripts/deploy.sh"
        "$PROJECT_ROOT/scripts/monitor.sh"
        "$PROJECT_ROOT/scripts/generate-ssl.sh"
    )
    
    for script in "${scripts[@]}"; do
        if [ -x "$script" ]; then
            print_success "$(basename "$script") is executable"
        else
            print_error "$(basename "$script") is not executable"
            chmod +x "$script"
            print_warning "Fixed permissions for $(basename "$script")"
        fi
        
        # Basic syntax check
        if bash -n "$script"; then
            print_success "$(basename "$script") syntax OK"
        else
            print_error "$(basename "$script") has syntax errors"
            return 1
        fi
    done
}

# Check GCP authentication
check_gcp_auth() {
    print_status "Checking GCP authentication..."
    
    if gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
        local account
        account=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1)
        print_success "GCP authenticated as: $account"
    else
        print_warning "GCP not authenticated. Run 'gcloud auth login' before deploying"
    fi
    
    # Check if gcloud SDK is properly configured
    if gcloud config get-value project &>/dev/null; then
        local project
        project=$(gcloud config get-value project)
        print_success "GCP project set: $project"
    else
        print_warning "No default GCP project set"
    fi
}

# Validate coturn configuration
validate_coturn_config() {
    print_status "Validating coturn configuration..."
    
    local config_file="$PROJECT_ROOT/coturn/turnserver.conf"
    
    # Check for required configurations
    local required_configs=(
        "listening-port"
        "tls-listening-port"
        "min-port"
        "max-port"
        "realm"
    )
    
    for config in "${required_configs[@]}"; do
        if grep -q "^${config}=" "$config_file" || grep -q "^# ${config}=" "$config_file"; then
            print_success "Configuration '$config' found"
        else
            print_error "Configuration '$config' missing"
            return 1
        fi
    done
    
    # Check for security configurations
    if grep -q "use-auth-secret" "$config_file"; then
        print_success "Authentication enabled"
    else
        print_warning "Authentication not configured"
    fi
    
    if grep -q "no-loopback-peers" "$config_file"; then
        print_success "Security restrictions configured"
    else
        print_warning "Security restrictions not configured"
    fi
}

# Performance test
performance_test() {
    print_status "Running performance validation..."
    
    # Check if we can create the expected number of file descriptors
    local max_files
    max_files=$(ulimit -n)
    
    if [ "$max_files" -ge 65536 ]; then
        print_success "File descriptor limit sufficient: $max_files"
    else
        print_warning "File descriptor limit low: $max_files (recommended: 65536+)"
    fi
    
    # Check available memory
    if command -v free &>/dev/null; then
        local mem_gb
        mem_gb=$(free -g | awk '/^Mem:/{print $2}')
        if [ "$mem_gb" -ge 4 ]; then
            print_success "Available memory sufficient: ${mem_gb}GB"
        else
            print_warning "Available memory low: ${mem_gb}GB (recommended: 4GB+)"
        fi
    fi
}

# Generate sample configuration
generate_sample_config() {
    print_status "Generating sample configuration..."
    
    if [ ! -f "$PROJECT_ROOT/.env" ]; then
        cp "$PROJECT_ROOT/.env.example" "$PROJECT_ROOT/.env"
        print_success "Created .env file from template"
        print_warning "Please edit .env file with your configuration"
    else
        print_success ".env file already exists"
    fi
}

# Main validation
main() {
    local errors=0
    
    echo "=================================="
    echo "WebRTC STUN/TURN Infrastructure"
    echo "Validation Report"
    echo "=================================="
    echo ""
    
    check_files || errors=$((errors + 1))
    echo ""
    
    check_dependencies || errors=$((errors + 1))
    echo ""
    
    validate_docker || errors=$((errors + 1))
    echo ""
    
    validate_terraform || errors=$((errors + 1))
    echo ""
    
    validate_scripts || errors=$((errors + 1))
    echo ""
    
    check_gcp_auth
    echo ""
    
    validate_coturn_config || errors=$((errors + 1))
    echo ""
    
    performance_test
    echo ""
    
    generate_sample_config
    echo ""
    
    echo "=================================="
    if [ $errors -eq 0 ]; then
        print_success "All validations passed! ✅"
        echo ""
        print_status "Next steps:"
        echo "1. Configure your .env file"
        echo "2. Run: ./scripts/deploy.sh --project-id YOUR_PROJECT_ID"
        echo "3. Test: ./scripts/monitor.sh test --project-id YOUR_PROJECT_ID"
    else
        print_error "$errors validation(s) failed! ❌"
        echo ""
        print_status "Please fix the errors above before proceeding"
    fi
    echo "=================================="
    
    return $errors
}

# Run validation
main "$@"