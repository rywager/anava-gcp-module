# WebRTC STUN/TURN Infrastructure

A comprehensive solution for deploying high-performance STUN/TURN servers using coturn, optimized for WebRTC applications and capable of handling thousands of concurrent connections.

## 🚀 Features

- **High Performance**: Optimized coturn configuration for thousands of connections
- **Security First**: Comprehensive security configurations and best practices
- **Scalable**: Auto-scaling infrastructure on Google Cloud Platform
- **Production Ready**: SSL/TLS support, monitoring, and management tools
- **Multi-Deployment**: Support for both Compute Engine and Cloud Run
- **Database Integration**: PostgreSQL and Redis for persistence and distributed state
- **Automated Deployment**: One-command deployment with Terraform

## 📋 Prerequisites

- Google Cloud Platform account with billing enabled
- Docker installed locally
- Terraform >= 1.0
- gcloud CLI installed and authenticated
- Domain name (for SSL certificates)

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   WebRTC App    │───▶│  Load Balancer   │───▶│  STUN/TURN     │
│                 │    │                  │    │  Servers        │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                       ┌──────────────────┐             │
                       │     Redis        │◀────────────┘
                       │   (Caching)      │
                       └──────────────────┘
                                                         │
                       ┌──────────────────┐             │
                       │   PostgreSQL     │◀────────────┘
                       │  (Persistence)   │
                       └──────────────────┘
```

## 🚀 Quick Start

### 1. Clone and Setup

```bash
cd /Users/ryanwager/terraform-installer/webrtc-infrastructure
```

### 2. Configure Environment

```bash
export PROJECT_ID="your-gcp-project-id"
export DOMAIN="turn.yourdomain.com"
export ENVIRONMENT="prod"
```

### 3. Generate SSL Certificates (Optional)

```bash
./scripts/generate-ssl.sh --domain "$DOMAIN" --email "admin@yourdomain.com"
```

### 4. Deploy Infrastructure

```bash
./scripts/deploy.sh --project-id "$PROJECT_ID" --domain "$DOMAIN" --environment "$ENVIRONMENT"
```

### 5. Test Deployment

```bash
./scripts/monitor.sh status --project-id "$PROJECT_ID" --environment "$ENVIRONMENT"
./scripts/monitor.sh test --project-id "$PROJECT_ID" --environment "$ENVIRONMENT"
```

## 📁 Project Structure

```
webrtc-infrastructure/
├── coturn/
│   ├── Dockerfile              # Optimized coturn container
│   ├── turnserver.conf         # Main coturn configuration
│   ├── security.conf           # Security hardening
│   ├── docker-compose.yml      # Local testing setup
│   ├── docker-entrypoint.sh    # Container startup script
│   └── init-db.sql            # Database initialization
├── terraform/
│   ├── main.tf                 # Main infrastructure
│   └── cloud-run.tf           # Cloud Run deployment
├── scripts/
│   ├── deploy.sh              # Deployment automation
│   ├── monitor.sh             # Management and monitoring
│   └── generate-ssl.sh        # SSL certificate generation
└── README.md                  # This file
```

## 🔧 Configuration Options

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PROJECT_ID` | GCP Project ID | - | ✅ |
| `DOMAIN` | TURN server domain | turn.example.com | ❌ |
| `ENVIRONMENT` | Environment name | dev | ❌ |
| `REGION` | GCP Region | us-central1 | ❌ |
| `EXTERNAL_IP` | Server external IP | auto-detect | ❌ |
| `TURN_SECRET` | Authentication secret | auto-generate | ❌ |
| `REDIS_HOST` | Redis host | - | ❌ |
| `POSTGRES_HOST` | PostgreSQL host | - | ❌ |

### Deployment Types

#### 1. Compute Engine (Recommended for TURN)
- Full UDP relay support
- Better performance for high traffic
- More expensive but more reliable

```bash
./scripts/deploy.sh --type compute --project-id "$PROJECT_ID"
```

#### 2. Cloud Run (STUN-only)
- Serverless, cost-effective
- Limited to STUN (no UDP relay)
- Good for STUN-only deployments

```bash
./scripts/deploy.sh --type cloud-run --project-id "$PROJECT_ID"
```

## 🔒 Security Features

### Authentication
- Shared secret authentication
- Time-limited credentials
- Origin validation

### Network Security
- Firewall rules for specific ports
- Private network restrictions
- DDoS protection via rate limiting

### TLS/SSL
- Strong cipher suites
- Certificate rotation
- DTLS support for secure relay

### Access Control
- IP-based restrictions
- User quotas and rate limiting
- Monitoring and alerting

## 📊 Monitoring and Management

### Check Status
```bash
./scripts/monitor.sh status --project-id "$PROJECT_ID"
```

### View Logs
```bash
./scripts/monitor.sh logs --project-id "$PROJECT_ID"
```

### Scale Instances
```bash
./scripts/monitor.sh scale --project-id "$PROJECT_ID" 5
```

### Restart Servers
```bash
./scripts/monitor.sh restart --project-id "$PROJECT_ID"
```

### Test Connectivity
```bash
./scripts/monitor.sh test --project-id "$PROJECT_ID"
```

## 🌐 WebRTC Integration

After deployment, use the TURN server in your WebRTC application:

```javascript
// Get configuration from Terraform output
const turnConfig = {
  iceServers: [
    {
      urls: 'stun:YOUR_TURN_SERVER_IP:3478'
    },
    {
      urls: [
        'turn:YOUR_TURN_SERVER_IP:3478',
        'turns:YOUR_TURN_SERVER_IP:5349'
      ],
      username: 'webrtc',
      credential: 'YOUR_TURN_SECRET'
    }
  ]
};

// Create peer connection
const peerConnection = new RTCPeerConnection(turnConfig);
```

### Dynamic Credential Generation

For enhanced security, generate time-limited credentials:

```javascript
// Server-side credential generation
const crypto = require('crypto');

function generateTurnCredentials(username, secret, ttl = 3600) {
  const unixTimeStamp = Math.floor(Date.now() / 1000) + ttl;
  const turnUsername = `${unixTimeStamp}:${username}`;
  const hmac = crypto.createHmac('sha1', secret);
  hmac.setEncoding('base64');
  hmac.write(turnUsername);
  hmac.end();
  const turnPassword = hmac.read();
  
  return {
    username: turnUsername,
    credential: turnPassword
  };
}
```

## 🔍 Testing and Validation

### Local Testing with Docker Compose

```bash
cd coturn/
export EXTERNAL_IP=$(curl -s https://api.ipify.org)
export TURN_SECRET="your-secret-here"
docker-compose up -d
```

### WebRTC Test Page

Open the generated test page in your browser:
```bash
open test-webrtc.html
```

### Command Line Testing

Test STUN connectivity:
```bash
# Install coturn client tools
sudo apt-get install coturn-utils

# Test STUN binding
turnutils_stunclient -v YOUR_TURN_SERVER_IP

# Test TURN relay
turnutils_uclient -v -t -u test -w your-secret YOUR_TURN_SERVER_IP
```

## 📈 Performance Tuning

### High Traffic Optimization

For thousands of concurrent connections:

1. **Increase ulimits**:
```bash
echo "coturn soft nofile 65536" >> /etc/security/limits.conf
echo "coturn hard nofile 65536" >> /etc/security/limits.conf
```

2. **Optimize kernel parameters**:
```bash
echo 'net.core.rmem_default = 262144' >> /etc/sysctl.conf
echo 'net.core.rmem_max = 16777216' >> /etc/sysctl.conf
echo 'net.core.wmem_default = 262144' >> /etc/sysctl.conf
echo 'net.core.wmem_max = 16777216' >> /etc/sysctl.conf
```

3. **Scale instance group**:
```bash
./scripts/monitor.sh scale --project-id "$PROJECT_ID" 10
```

### Resource Requirements

| Concurrent Connections | CPU | Memory | Bandwidth |
|------------------------|-----|---------|-----------|
| 100 | 1 vCPU | 1GB | 10 Mbps |
| 500 | 2 vCPU | 2GB | 50 Mbps |
| 1000 | 4 vCPU | 4GB | 100 Mbps |
| 5000 | 8 vCPU | 8GB | 500 Mbps |

## 🔧 Troubleshooting

### Common Issues

#### 1. Connection Refused
```bash
# Check firewall rules
gcloud compute firewall-rules list --filter="name:coturn"

# Check instance health
./scripts/monitor.sh status
```

#### 2. SSL Certificate Issues
```bash
# Verify certificate
openssl x509 -in coturn/certs/cert.pem -text -noout

# Regenerate certificates
./scripts/generate-ssl.sh --domain "$DOMAIN"
```

#### 3. High CPU Usage
```bash
# Scale up instances
./scripts/monitor.sh scale 5

# Check logs for errors
./scripts/monitor.sh logs
```

#### 4. Database Connection Issues
```bash
# Check database status
gcloud sql instances describe coturn-db-$ENVIRONMENT

# Test connectivity
gcloud sql connect coturn-db-$ENVIRONMENT --user=coturn
```

### Debug Mode

Enable verbose logging:
```bash
export TURN_DEBUG=1
docker-compose restart
```

## 🚮 Cleanup

To remove all infrastructure:

```bash
./scripts/monitor.sh cleanup --project-id "$PROJECT_ID" --environment "$ENVIRONMENT"
```

## 📊 Cost Estimation

Monthly costs (US regions):

| Component | Small (100 users) | Medium (1000 users) | Large (5000 users) |
|-----------|-------------------|--------------------|--------------------|
| Compute Engine | $50 | $200 | $800 |
| Load Balancer | $20 | $20 | $50 |
| Database | $15 | $50 | $200 |
| Redis | $10 | $30 | $100 |
| **Total** | **~$95** | **~$300** | **~$1150** |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Support

For issues and questions:

1. Check the troubleshooting section
2. Review the logs: `./scripts/monitor.sh logs`
3. Test connectivity: `./scripts/monitor.sh test`
4. Open an issue with detailed information

## 🔗 References

- [Coturn Documentation](https://github.com/coturn/coturn)
- [WebRTC STUN/TURN Guide](https://webrtc.org/)
- [Google Cloud Platform](https://cloud.google.com/)
- [Terraform GCP Provider](https://registry.terraform.io/providers/hashicorp/google/latest)

---

**Note**: This infrastructure is designed for production use but requires proper SSL certificates and domain configuration for full security. Always test thoroughly before deploying to production environments.