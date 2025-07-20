#!/bin/bash
set -e

# Function to log messages
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

log "Starting coturn server initialization..."

# Check required environment variables
if [ -z "$EXTERNAL_IP" ]; then
    log "WARNING: EXTERNAL_IP not set. Trying to detect..."
    # Try to get external IP from metadata service (works on GCP)
    EXTERNAL_IP=$(curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip 2>/dev/null || echo "")
    if [ -z "$EXTERNAL_IP" ]; then
        # Fallback to public IP detection service
        EXTERNAL_IP=$(curl -s https://api.ipify.org 2>/dev/null || echo "")
    fi
    if [ -z "$EXTERNAL_IP" ]; then
        log "ERROR: Could not determine external IP. Please set EXTERNAL_IP environment variable."
        exit 1
    fi
    log "Detected external IP: $EXTERNAL_IP"
fi

# Generate auth secret if not provided
if [ -z "$TURN_SECRET" ]; then
    TURN_SECRET=$(openssl rand -hex 32)
    log "Generated new TURN secret"
fi

# Set default values
REALM=${REALM:-"webrtc.example.com"}
RELAY_THREADS=${RELAY_THREADS:-$(nproc)}
CLI_PASSWORD=${CLI_PASSWORD:-$(openssl rand -hex 16)}

# Create configuration from template
log "Generating configuration file..."
cp /etc/coturn/turnserver.conf.template /tmp/turnserver.conf

# Replace environment variables in config
cat > /tmp/turnserver-env.conf << EOF
# Auto-generated configuration
external-ip=$EXTERNAL_IP
static-auth-secret=$TURN_SECRET
realm=$REALM
relay-threads=$RELAY_THREADS
cli-password=$CLI_PASSWORD
EOF

# Add SSL configuration if certificates are provided
if [ -f "/etc/coturn/certs/cert.pem" ] && [ -f "/etc/coturn/certs/privkey.pem" ]; then
    log "SSL certificates found, enabling TLS..."
    cat >> /tmp/turnserver-env.conf << EOF
cert=/etc/coturn/certs/cert.pem
pkey=/etc/coturn/certs/privkey.pem
cipher-list="ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-SHA384"
dh-file=/etc/coturn/dhparam.pem
EOF
else
    log "No SSL certificates found, TLS will be disabled"
fi

# Add Redis configuration if provided
if [ ! -z "$REDIS_HOST" ]; then
    log "Configuring Redis for distributed state..."
    cat >> /tmp/turnserver-env.conf << EOF
redis-userdb="ip=$REDIS_HOST dbname=0 password=$REDIS_PASSWORD port=${REDIS_PORT:-6379} connect_timeout=30"
redis-statsdb="ip=$REDIS_HOST dbname=1 password=$REDIS_PASSWORD port=${REDIS_PORT:-6379} connect_timeout=30"
use-redis-statsdb
EOF
fi

# Add PostgreSQL configuration if provided
if [ ! -z "$POSTGRES_HOST" ]; then
    log "Configuring PostgreSQL for persistent storage..."
    cat >> /tmp/turnserver-env.conf << EOF
psql-userdb="host=$POSTGRES_HOST dbname=${POSTGRES_DB:-coturn} user=${POSTGRES_USER:-coturn} password=$POSTGRES_PASSWORD connect_timeout=30"
EOF
fi

# Merge configurations
cat /tmp/turnserver.conf > /etc/coturn/turnserver.conf
cat /tmp/turnserver-env.conf >> /etc/coturn/turnserver.conf

# Create health check endpoint
cat > /tmp/health.sh << 'EOF'
#!/bin/sh
# Simple health check that tests STUN binding
timeout 2 nc -u -z localhost 3478 && echo "OK" || exit 1
EOF
chmod +x /tmp/health.sh

# Log configuration summary
log "Configuration summary:"
log "  External IP: $EXTERNAL_IP"
log "  Realm: $REALM"
log "  Relay threads: $RELAY_THREADS"
log "  Redis: ${REDIS_HOST:-disabled}"
log "  PostgreSQL: ${POSTGRES_HOST:-disabled}"
log "  TLS: $([ -f "/etc/coturn/certs/cert.pem" ] && echo "enabled" || echo "disabled")"

# Create test credentials for monitoring
if [ ! -z "$MONITORING_USER" ]; then
    log "Creating monitoring user..."
    MONITORING_PASSWORD=$(echo -n "${MONITORING_USER}:${REALM}:${MONITORING_PASS:-monitoring}" | md5sum | cut -d' ' -f1)
    echo "${MONITORING_USER}:${MONITORING_PASSWORD}" > /tmp/turnuserdb.conf
fi

log "Starting coturn server..."

# Execute coturn with all arguments
exec "$@"