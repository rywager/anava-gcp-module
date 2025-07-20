#!/bin/bash
#
# Anava Vision Enterprise Installer
# One-click installation script with zero manual configuration
#

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# Installation directory
INSTALL_DIR="/opt/anava-vision"
CONFIG_DIR="/etc/anava-vision"
DATA_DIR="/var/lib/anava-vision"
LOG_DIR="/var/log/anava-vision"

# System requirements
MIN_MEMORY_GB=8
MIN_DISK_GB=50
MIN_CPU_CORES=4

# Version
VERSION="1.0.0"

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# Check system requirements
check_system_requirements() {
    log_info "Checking system requirements..."
    
    # Check OS
    if [[ ! -f /etc/os-release ]]; then
        log_error "Cannot determine OS. This installer requires Ubuntu 20.04+ or Debian 10+"
        exit 1
    fi
    
    source /etc/os-release
    if [[ ! "$ID" =~ ^(ubuntu|debian)$ ]]; then
        log_error "This installer only supports Ubuntu and Debian"
        exit 1
    fi
    
    # Check memory
    TOTAL_MEM_GB=$(awk '/MemTotal/ {printf "%.0f", $2/1024/1024}' /proc/meminfo)
    if [[ $TOTAL_MEM_GB -lt $MIN_MEMORY_GB ]]; then
        log_error "Insufficient memory. Required: ${MIN_MEMORY_GB}GB, Available: ${TOTAL_MEM_GB}GB"
        exit 1
    fi
    
    # Check CPU cores
    CPU_CORES=$(nproc)
    if [[ $CPU_CORES -lt $MIN_CPU_CORES ]]; then
        log_error "Insufficient CPU cores. Required: ${MIN_CPU_CORES}, Available: ${CPU_CORES}"
        exit 1
    fi
    
    # Check disk space
    AVAILABLE_DISK_GB=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
    if [[ $AVAILABLE_DISK_GB -lt $MIN_DISK_GB ]]; then
        log_error "Insufficient disk space. Required: ${MIN_DISK_GB}GB, Available: ${AVAILABLE_DISK_GB}GB"
        exit 1
    fi
    
    log_success "System requirements met"
}

# Install dependencies
install_dependencies() {
    log_info "Installing system dependencies..."
    
    # Update package lists
    apt-get update -qq
    
    # Install required packages
    DEBIAN_FRONTEND=noninteractive apt-get install -y \
        curl \
        wget \
        git \
        htop \
        jq \
        net-tools \
        dnsutils \
        software-properties-common \
        apt-transport-https \
        ca-certificates \
        gnupg \
        lsb-release \
        python3 \
        python3-pip \
        python3-venv \
        nginx \
        certbot \
        python3-certbot-nginx \
        ufw \
        fail2ban
    
    log_success "System dependencies installed"
}

# Install Docker
install_docker() {
    log_info "Installing Docker..."
    
    if command -v docker &> /dev/null; then
        log_info "Docker already installed"
        return
    fi
    
    # Add Docker's official GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Add Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker
    apt-get update -qq
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
    
    # Enable and start Docker
    systemctl enable docker
    systemctl start docker
    
    log_success "Docker installed"
}

# Configure firewall
configure_firewall() {
    log_info "Configuring firewall..."
    
    # Enable UFW
    ufw --force enable
    
    # Allow SSH
    ufw allow 22/tcp
    
    # Allow HTTP and HTTPS
    ufw allow 80/tcp
    ufw allow 443/tcp
    
    # Allow Docker Swarm (if needed)
    ufw allow 2377/tcp
    ufw allow 7946/tcp
    ufw allow 7946/udp
    ufw allow 4789/udp
    
    # Allow camera discovery
    ufw allow 554/tcp  # RTSP
    ufw allow 8080/tcp # Alternative HTTP
    
    # Reload UFW
    ufw reload
    
    log_success "Firewall configured"
}

# Generate secure passwords
generate_passwords() {
    log_info "Generating secure passwords..."
    
    # Generate random passwords
    DB_PASSWORD=$(openssl rand -base64 32)
    REDIS_PASSWORD=$(openssl rand -base64 32)
    JWT_SECRET=$(openssl rand -base64 64)
    GRAFANA_PASSWORD=$(openssl rand -base64 16)
    TRAEFIK_PASSWORD=$(openssl rand -base64 16)
    
    # Generate bcrypt hash for Traefik
    TRAEFIK_AUTH="admin:$(openssl passwd -6 "$TRAEFIK_PASSWORD")"
    
    log_success "Passwords generated"
}

# Create directory structure
create_directories() {
    log_info "Creating directory structure..."
    
    mkdir -p "$INSTALL_DIR"/{traefik,prometheus,grafana,loki,promtail}
    mkdir -p "$CONFIG_DIR"
    mkdir -p "$DATA_DIR"/{uploads,streams,metrics}
    mkdir -p "$LOG_DIR"
    
    # Set permissions
    chmod 750 "$CONFIG_DIR"
    chmod 755 "$DATA_DIR"
    chmod 755 "$LOG_DIR"
    
    log_success "Directory structure created"
}

# Configure domain
configure_domain() {
    log_info "Configuring domain..."
    
    # Prompt for domain
    read -p "Enter your domain name (e.g., example.com): " DOMAIN
    
    # Validate domain
    if [[ ! "$DOMAIN" =~ ^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$ ]]; then
        log_error "Invalid domain name"
        exit 1
    fi
    
    # Prompt for email
    read -p "Enter your email address for SSL certificates: " EMAIL
    
    # Validate email
    if [[ ! "$EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$ ]]; then
        log_error "Invalid email address"
        exit 1
    fi
    
    log_success "Domain configured: $DOMAIN"
}

# Create configuration files
create_configs() {
    log_info "Creating configuration files..."
    
    # Create .env file
    cat > "$INSTALL_DIR/.env" << EOF
# Anava Vision Environment Configuration
# Auto-generated - Do not edit manually

# Domain Configuration
DOMAIN=$DOMAIN
EMAIL=$EMAIL

# Database Configuration
DB_PASSWORD=$DB_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD

# Security
JWT_SECRET=$JWT_SECRET
TRAEFIK_AUTH=$TRAEFIK_AUTH

# Monitoring
GRAFANA_USER=admin
GRAFANA_PASSWORD=$GRAFANA_PASSWORD

# Email Notifications (configure later)
EMAIL_FROM=noreply@$DOMAIN
EMAIL_TO=$EMAIL
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=

# Cloudflare (optional for DNS)
CF_API_EMAIL=
CF_API_KEY=
EOF

    # Create Traefik configuration
    cat > "$INSTALL_DIR/traefik/traefik.yml" << 'EOF'
api:
  dashboard: true
  debug: true

entryPoints:
  http:
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: https
          scheme: https
  https:
    address: ":443"

serversTransport:
  insecureSkipVerify: true

providers:
  docker:
    endpoint: "unix:///var/run/docker.sock"
    exposedByDefault: false
  file:
    filename: /config.yml

certificatesResolvers:
  cloudflare:
    acme:
      email: ${EMAIL}
      storage: acme.json
      httpChallenge:
        entryPoint: http

log:
  level: INFO
  filePath: /logs/traefik.log

accessLog:
  filePath: /logs/access.log
EOF

    # Create Traefik dynamic config
    cat > "$INSTALL_DIR/traefik/config.yml" << 'EOF'
http:
  middlewares:
    secureHeaders:
      headers:
        sslRedirect: true
        forceSTSHeader: true
        stsIncludeSubdomains: true
        stsPreload: true
        stsSeconds: 31536000

    rateLimit:
      rateLimit:
        average: 100
        burst: 50

tls:
  options:
    default:
      minVersion: VersionTLS12
      cipherSuites:
        - TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
        - TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384
        - TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305
EOF

    # Create Prometheus configuration
    cat > "$INSTALL_DIR/prometheus/prometheus.yml" << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'node'
    static_configs:
      - targets: ['host.docker.internal:9100']

  - job_name: 'docker'
    static_configs:
      - targets: ['host.docker.internal:9323']

  - job_name: 'anava-supervisor'
    static_configs:
      - targets: ['supervisor:9000']

  - job_name: 'anava-api'
    static_configs:
      - targets: ['api:9000']
EOF

    # Create Loki configuration
    cat > "$INSTALL_DIR/loki/loki-config.yml" << 'EOF'
auth_enabled: false

server:
  http_listen_port: 3100

ingester:
  lifecycler:
    address: 127.0.0.1
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
    final_sleep: 0s
  chunk_idle_period: 5m
  chunk_retain_period: 30s

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

storage_config:
  boltdb_shipper:
    active_index_directory: /loki/boltdb-shipper-active
    cache_location: /loki/boltdb-shipper-cache
    shared_store: filesystem
  filesystem:
    directory: /loki/chunks

limits_config:
  reject_old_samples: true
  reject_old_samples_max_age: 168h

chunk_store_config:
  max_look_back_period: 0s

table_manager:
  retention_deletes_enabled: false
  retention_period: 0s
EOF

    # Create Promtail configuration
    cat > "$INSTALL_DIR/promtail/promtail-config.yml" << 'EOF'
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: containers
    static_configs:
      - targets:
          - localhost
        labels:
          job: containerlogs
          __path__: /var/lib/docker/containers/*/*log

    pipeline_stages:
      - json:
          expressions:
            output: log
            stream: stream
            attrs:
      - json:
          expressions:
            tag:
          source: attrs
      - regex:
          expression: (?P<container_name>(?:[^|]*))\|(?P<image_name>(?:[^|]*))
          source: tag
      - timestamp:
          format: RFC3339Nano
          source: time
      - labels:
          stream:
          container_name:
          image_name:
      - output:
          source: output
EOF

    # Create database initialization script
    cat > "$INSTALL_DIR/init-db.sql" << 'EOF'
-- Anava Vision Database Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cameras table
CREATE TABLE IF NOT EXISTS cameras (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    camera_id VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    ip_address INET NOT NULL,
    port INTEGER DEFAULT 80,
    username VARCHAR(255),
    password VARCHAR(255),
    rtsp_url TEXT,
    model VARCHAR(255),
    manufacturer VARCHAR(255),
    mac_address MACADDR,
    firmware_version VARCHAR(100),
    status VARCHAR(50) DEFAULT 'offline',
    capabilities JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Events table
CREATE TABLE IF NOT EXISTS events (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    camera_id UUID REFERENCES cameras(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    confidence FLOAT,
    metadata JSONB DEFAULT '{}'::jsonb,
    thumbnail_url TEXT,
    video_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Analytics table
CREATE TABLE IF NOT EXISTS analytics (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    camera_id UUID REFERENCES cameras(id) ON DELETE CASCADE,
    metric_type VARCHAR(100) NOT NULL,
    value NUMERIC,
    metadata JSONB DEFAULT '{}'::jsonb,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX idx_cameras_status ON cameras(status);
CREATE INDEX idx_cameras_last_seen ON cameras(last_seen);
CREATE INDEX idx_events_camera_id ON events(camera_id);
CREATE INDEX idx_events_created_at ON events(created_at);
CREATE INDEX idx_analytics_camera_id ON analytics(camera_id);
CREATE INDEX idx_analytics_timestamp ON analytics(timestamp);
CREATE INDEX idx_audit_log_user_id ON audit_log(user_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at);

-- Create update trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cameras_updated_at BEFORE UPDATE ON cameras
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user (password: admin - CHANGE THIS!)
INSERT INTO users (email, password_hash, name, role) VALUES (
    'admin@anava.vision',
    crypt('admin', gen_salt('bf')),
    'Admin User',
    'admin'
) ON CONFLICT (email) DO NOTHING;
EOF

    # Create Dockerfile for supervisor
    cat > "$INSTALL_DIR/Dockerfile.supervisor" << 'EOF'
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    python3-dev \
    libpq-dev \
    net-tools \
    iputils-ping \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
RUN pip install --no-cache-dir \
    aiohttp \
    aiohttp-digest-auth \
    pyyaml \
    asyncio \
    netifaces \
    psycopg2-binary \
    redis \
    prometheus-client

# Copy supervisor script
COPY supervisor.py /app/

# Create necessary directories
RUN mkdir -p /etc/anava-vision /var/lib/anava-vision

# Run supervisor
CMD ["python3", "-u", "supervisor.py"]
EOF

    # Create Grafana provisioning
    mkdir -p "$INSTALL_DIR/grafana/provisioning/datasources"
    mkdir -p "$INSTALL_DIR/grafana/provisioning/dashboards"
    
    cat > "$INSTALL_DIR/grafana/provisioning/datasources/prometheus.yml" << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true

  - name: Loki
    type: loki
    access: proxy
    url: http://loki:3100
    editable: true
EOF

    # Set permissions
    chmod 600 "$INSTALL_DIR/.env"
    chmod 600 "$INSTALL_DIR/traefik/acme.json" 2>/dev/null || touch "$INSTALL_DIR/traefik/acme.json" && chmod 600 "$INSTALL_DIR/traefik/acme.json"
    
    log_success "Configuration files created"
}

# Create systemd service
create_systemd_service() {
    log_info "Creating systemd service..."
    
    cat > /etc/systemd/system/anava-vision.service << EOF
[Unit]
Description=Anava Vision Enterprise Stack
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$INSTALL_DIR
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    # Create supervisor service
    cat > /etc/systemd/system/anava-supervisor.service << EOF
[Unit]
Description=Anava Vision Camera Discovery Supervisor
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
Environment="PYTHONUNBUFFERED=1"
ExecStart=/usr/bin/python3 $INSTALL_DIR/supervisor.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd
    systemctl daemon-reload
    
    log_success "Systemd services created"
}

# Install Python dependencies
install_python_deps() {
    log_info "Installing Python dependencies..."
    
    # Create virtual environment
    python3 -m venv "$INSTALL_DIR/venv"
    
    # Install dependencies
    "$INSTALL_DIR/venv/bin/pip" install --upgrade pip
    "$INSTALL_DIR/venv/bin/pip" install \
        aiohttp \
        aiohttp-digest-auth \
        pyyaml \
        netifaces \
        psycopg2-binary \
        redis \
        prometheus-client
    
    log_success "Python dependencies installed"
}

# Start services
start_services() {
    log_info "Starting services..."
    
    # Copy files
    cp "$0" "$INSTALL_DIR/"
    cp supervisor.py "$INSTALL_DIR/"
    cp docker-compose.yml "$INSTALL_DIR/"
    
    # Start Docker Compose
    cd "$INSTALL_DIR"
    docker compose up -d
    
    # Enable and start systemd service
    systemctl enable anava-vision.service
    systemctl start anava-vision.service
    
    log_success "Services started"
}

# Configure automatic updates
configure_updates() {
    log_info "Configuring automatic updates..."
    
    # Create update script
    cat > "$INSTALL_DIR/update.sh" << 'EOF'
#!/bin/bash
# Anava Vision Auto-Update Script

cd /opt/anava-vision

# Pull latest images
docker compose pull

# Restart services
docker compose up -d

# Prune old images
docker image prune -f

# Log update
echo "$(date): Update completed" >> /var/log/anava-vision/updates.log
EOF

    chmod +x "$INSTALL_DIR/update.sh"
    
    # Create cron job for updates
    cat > /etc/cron.d/anava-vision-update << EOF
# Anava Vision Auto-Update
# Run daily at 3 AM
0 3 * * * root $INSTALL_DIR/update.sh
EOF
    
    log_success "Automatic updates configured"
}

# Display completion message
display_completion() {
    echo
    echo "========================================"
    echo "   Anava Vision Installation Complete"
    echo "========================================"
    echo
    echo "Access URLs:"
    echo "  Web App:        https://$DOMAIN"
    echo "  API:            https://api.$DOMAIN"
    echo "  Traefik:        https://traefik.$DOMAIN"
    echo "  Grafana:        https://grafana.$DOMAIN"
    echo "  Prometheus:     https://prometheus.$DOMAIN"
    echo
    echo "Credentials:"
    echo "  Admin Email:    admin@anava.vision"
    echo "  Admin Password: admin (CHANGE THIS!)"
    echo "  Grafana User:   admin"
    echo "  Grafana Pass:   $GRAFANA_PASSWORD"
    echo "  Traefik User:   admin"
    echo "  Traefik Pass:   $TRAEFIK_PASSWORD"
    echo
    echo "Important Files:"
    echo "  Environment:    $INSTALL_DIR/.env"
    echo "  Docker Compose: $INSTALL_DIR/docker-compose.yml"
    echo "  Logs:           $LOG_DIR/"
    echo
    echo "Next Steps:"
    echo "  1. Change the default admin password"
    echo "  2. Configure SSL certificates (if not using Cloudflare)"
    echo "  3. Set up email notifications in .env file"
    echo "  4. Access Grafana to view system metrics"
    echo
    echo "To check service status:"
    echo "  systemctl status anava-vision"
    echo "  docker compose -f $INSTALL_DIR/docker-compose.yml ps"
    echo
}

# Main installation flow
main() {
    clear
    echo "======================================"
    echo "  Anava Vision Enterprise Installer"
    echo "       Version: $VERSION"
    echo "======================================"
    echo
    
    # Run installation steps
    check_root
    check_system_requirements
    install_dependencies
    install_docker
    configure_firewall
    configure_domain
    generate_passwords
    create_directories
    create_configs
    create_systemd_service
    install_python_deps
    start_services
    configure_updates
    
    # Show completion
    display_completion
    
    log_success "Installation completed successfully!"
}

# Run main function
main "$@"