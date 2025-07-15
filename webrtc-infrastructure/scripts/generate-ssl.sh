#!/bin/bash
set -e

# SSL Certificate Generation Script for STUN/TURN Server

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
CERTS_DIR="$PROJECT_ROOT/coturn/certs"

# Default values
DOMAIN=${DOMAIN:-"turn.example.com"}
COUNTRY=${COUNTRY:-"US"}
STATE=${STATE:-"California"}
CITY=${CITY:-"San Francisco"}
ORG=${ORG:-"YourOrganization"}
OU=${OU:-"IT Department"}
EMAIL=${EMAIL:-"admin@example.com"}
KEY_SIZE=${KEY_SIZE:-"4096"}
DAYS=${DAYS:-"365"}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --domain)
            DOMAIN="$2"
            shift 2
            ;;
        --country)
            COUNTRY="$2"
            shift 2
            ;;
        --state)
            STATE="$2"
            shift 2
            ;;
        --city)
            CITY="$2"
            shift 2
            ;;
        --org)
            ORG="$2"
            shift 2
            ;;
        --email)
            EMAIL="$2"
            shift 2
            ;;
        --days)
            DAYS="$2"
            shift 2
            ;;
        --help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --domain     Domain name for certificate (default: turn.example.com)"
            echo "  --country    Country code (default: US)"
            echo "  --state      State name (default: California)"
            echo "  --city       City name (default: San Francisco)"
            echo "  --org        Organization name (default: YourOrganization)"
            echo "  --email      Email address (default: admin@example.com)"
            echo "  --days       Certificate validity in days (default: 365)"
            echo "  --help       Show this help message"
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if openssl is available
if ! command -v openssl &> /dev/null; then
    print_error "OpenSSL is required but not installed"
    exit 1
fi

# Create certificates directory
mkdir -p "$CERTS_DIR"

print_status "Generating SSL certificates for domain: $DOMAIN"

# Generate private key
print_status "Generating private key..."
openssl genrsa -out "$CERTS_DIR/privkey.pem" "$KEY_SIZE"

# Create certificate signing request configuration
cat > "$CERTS_DIR/csr.conf" << EOF
[req]
default_bits = $KEY_SIZE
prompt = no
default_md = sha256
distinguished_name = dn
req_extensions = v3_req

[dn]
C=$COUNTRY
ST=$STATE
L=$CITY
O=$ORG
OU=$OU
CN=$DOMAIN
emailAddress=$EMAIL

[v3_req]
basicConstraints = CA:FALSE
keyUsage = nonRepudiation, digitalSignature, keyEncipherment
subjectAltName = @alt_names

[alt_names]
DNS.1 = $DOMAIN
DNS.2 = *.$DOMAIN
IP.1 = 127.0.0.1
EOF

# Generate certificate signing request
print_status "Generating certificate signing request..."
openssl req -new -key "$CERTS_DIR/privkey.pem" -out "$CERTS_DIR/cert.csr" -config "$CERTS_DIR/csr.conf"

# Generate self-signed certificate
print_status "Generating self-signed certificate..."
openssl x509 -req -in "$CERTS_DIR/cert.csr" -signkey "$CERTS_DIR/privkey.pem" -out "$CERTS_DIR/cert.pem" -days "$DAYS" -extensions v3_req -extfile "$CERTS_DIR/csr.conf"

# Generate certificate chain (self-signed, so cert is the chain)
cp "$CERTS_DIR/cert.pem" "$CERTS_DIR/fullchain.pem"

# Generate DH parameters for enhanced security
print_status "Generating Diffie-Hellman parameters (this may take a while)..."
openssl dhparam -out "$CERTS_DIR/dhparam.pem" 2048

# Set appropriate permissions
chmod 600 "$CERTS_DIR/privkey.pem"
chmod 644 "$CERTS_DIR/cert.pem"
chmod 644 "$CERTS_DIR/fullchain.pem"
chmod 644 "$CERTS_DIR/dhparam.pem"

# Clean up temporary files
rm -f "$CERTS_DIR/cert.csr" "$CERTS_DIR/csr.conf"

print_success "SSL certificates generated successfully!"

echo ""
echo "=== CERTIFICATE SUMMARY ==="
echo "Domain: $DOMAIN"
echo "Valid for: $DAYS days"
echo "Files generated:"
echo "  Private key: $CERTS_DIR/privkey.pem"
echo "  Certificate: $CERTS_DIR/cert.pem"
echo "  Full chain: $CERTS_DIR/fullchain.pem"
echo "  DH params:  $CERTS_DIR/dhparam.pem"
echo ""

# Display certificate information
print_status "Certificate details:"
openssl x509 -in "$CERTS_DIR/cert.pem" -text -noout | grep -E "(Subject|Issuer|Not Before|Not After|DNS:|IP Address:)"

echo ""
print_warning "IMPORTANT NOTES:"
echo "1. This is a self-signed certificate - browsers will show security warnings"
echo "2. For production, obtain certificates from a trusted CA (Let's Encrypt, etc.)"
echo "3. Keep the private key secure and never share it"
echo "4. The certificate will expire in $DAYS days"

# Create Let's Encrypt instructions
cat > "$CERTS_DIR/letsencrypt-instructions.md" << EOF
# Let's Encrypt Certificate Instructions

To obtain a production certificate from Let's Encrypt:

## Using Certbot (recommended):

1. Install certbot:
   \`\`\`bash
   sudo apt-get install certbot
   # or
   brew install certbot
   \`\`\`

2. Obtain certificate:
   \`\`\`bash
   sudo certbot certonly --standalone \\
     --preferred-challenges http \\
     -d $DOMAIN \\
     --email $EMAIL \\
     --agree-tos \\
     --non-interactive
   \`\`\`

3. Copy certificates to coturn directory:
   \`\`\`bash
   sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem $CERTS_DIR/
   sudo cp /etc/letsencrypt/live/$DOMAIN/cert.pem $CERTS_DIR/
   sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem $CERTS_DIR/
   sudo chown coturn:coturn $CERTS_DIR/*.pem
   \`\`\`

4. Set up automatic renewal:
   \`\`\`bash
   sudo crontab -e
   # Add this line:
   0 2 * * * certbot renew --quiet --post-hook "docker restart coturn-server"
   \`\`\`

## Using DNS challenge (for wildcard certificates):

\`\`\`bash
sudo certbot certonly --manual \\
  --preferred-challenges dns \\
  -d $DOMAIN \\
  -d *.$DOMAIN \\
  --email $EMAIL \\
  --agree-tos
\`\`\`

## Using Google Cloud DNS (if using GCP):

1. Install the plugin:
   \`\`\`bash
   pip install certbot-dns-google
   \`\`\`

2. Create service account and download key
3. Run certbot:
   \`\`\`bash
   certbot certonly \\
     --dns-google \\
     --dns-google-credentials /path/to/service-account.json \\
     -d $DOMAIN
   \`\`\`
EOF

print_status "Let's Encrypt instructions saved to: $CERTS_DIR/letsencrypt-instructions.md"

# Test certificate
print_status "Testing certificate..."
if openssl x509 -in "$CERTS_DIR/cert.pem" -noout -checkend 86400; then
    print_success "Certificate is valid and not expiring within 24 hours"
else
    print_warning "Certificate validation failed or expires soon"
fi

print_success "SSL certificate generation completed!"
echo "You can now deploy your STUN/TURN server with TLS support."