# Anava Vision Zero-Touch Deployment System

🚀 **Deploy Anava Vision with a single command on any Linux system!**

## Overview

This zero-touch deployment system makes Anava Vision truly enterprise-ready with automated installation, configuration, and management. It includes everything needed for production deployment with zero manual configuration.

## Features

✅ **One-Command Deployment**: `./deploy.sh` handles everything  
✅ **Automatic SSL Certificates**: Let's Encrypt integration via cert-manager  
✅ **Service Mesh**: Istio for advanced WebSocket management  
✅ **Auto Camera Discovery**: Automatic ONVIF camera enrollment  
✅ **Self-Healing**: Automatic issue detection and resolution  
✅ **Zero-Downtime Updates**: Rolling updates with traffic management  
✅ **Enterprise Monitoring**: Prometheus + Grafana pre-configured  
✅ **Multi-Cloud Support**: Works on any Kubernetes cluster  

## Quick Start

```bash
# Clone the repository
git clone https://github.com/anava-vision/zero-touch
cd zero-touch

# Deploy Anava Vision
./deploy.sh
```

That's it! The system will:
1. Detect your environment
2. Install all required components
3. Configure SSL certificates
4. Deploy Anava Vision
5. Set up monitoring
6. Start camera discovery

## Prerequisites

- Linux system (Ubuntu 20.04+ recommended)
- Kubernetes cluster (1.24+)
- kubectl configured
- Helm 3.x installed
- Domain name (optional, will use .local if not provided)

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│                 │     │                 │     │                 │
│   Ingress +     │────▶│  Istio Service  │────▶│   Anava Vision  │
│   SSL/TLS       │     │      Mesh       │     │   Application   │
│                 │     │                 │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │                          │
                               ▼                          ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │   WebSocket     │     │   PostgreSQL    │
                        │   Service       │     │   + Redis       │
                        └─────────────────┘     └─────────────────┘
                                                         │
                        ┌─────────────────┐     ┌─────────────────┐
                        │ Camera Discovery│     │  Self-Healing   │
                        │    Service      │     │   Controller    │
                        └─────────────────┘     └─────────────────┘
```

## Deployment Options

### Basic Deployment
```bash
./deploy.sh
```

### Custom Domain
```bash
DOMAIN=anava.example.com ./deploy.sh
```

### Specific Environment
```bash
ENVIRONMENT=staging ./deploy.sh
```

### Custom Namespace
```bash
NAMESPACE=security-system ./deploy.sh
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DOMAIN` | Your domain name | Auto-detected or `.local` |
| `ENVIRONMENT` | Deployment environment | `production` |
| `NAMESPACE` | Kubernetes namespace | `anava-vision` |
| `EMAIL` | Email for SSL certificates | `admin@example.com` |

### Helm Values

Customize deployment by editing `helm/anava-vision/values-production.yaml`:

```yaml
replicaCount: 3
image:
  repository: gcr.io/anava-vision/anava-vision
  tag: 2.3.31
websocket:
  enabled: true
  replicaCount: 3
monitoring:
  enabled: true
```

## Features in Detail

### 🔒 Automatic SSL Certificates

- Automatically provisions SSL certificates from Let's Encrypt
- Handles certificate renewal
- Supports wildcard certificates
- Zero manual configuration required

### 🌐 Service Mesh (Istio)

- Advanced traffic management for WebSockets
- Automatic retries and circuit breaking
- Load balancing with session affinity
- mTLS for service-to-service communication

### 📹 Automatic Camera Enrollment

- Discovers ONVIF cameras on the network
- Automatically enrolls compatible cameras
- Continuous scanning for new devices
- Support for multiple camera protocols

### 🔧 Self-Healing Configuration

The system automatically detects and fixes:
- High memory usage (pod restart)
- High CPU usage (auto-scaling)
- WebSocket connection issues
- Database connection failures
- Camera disconnections

### 📊 Enterprise Monitoring

Pre-configured dashboards for:
- System overview
- Camera status
- WebSocket connections
- Performance metrics
- Alert management

Access Grafana at: `https://YOUR_DOMAIN/grafana` (admin/anava-admin)

### 🔄 Zero-Downtime Updates

- Rolling updates with readiness checks
- Automatic rollback on failure
- Traffic shifting during updates
- Database migration handling

## CI/CD Integration

### GitHub Actions
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy
        run: ./deploy.sh
```

### GitLab CI
```yaml
deploy:
  stage: deploy
  script:
    - ./deploy.sh
  only:
    - main
```

## Monitoring & Alerts

### Prometheus Alerts

Pre-configured alerts for:
- Service downtime
- High resource usage
- WebSocket errors
- Camera disconnections
- Database issues

### Slack Integration

```bash
# Set Slack webhook in values
SLACK_WEBHOOK=https://hooks.slack.com/... ./deploy.sh
```

## Troubleshooting

### Check Deployment Status
```bash
kubectl get pods -n anava-vision
kubectl logs -f deployment/anava-vision -n anava-vision
```

### View Monitoring
```bash
# Port-forward to Grafana
kubectl port-forward -n monitoring svc/prometheus-grafana 3000:80
# Access at http://localhost:3000
```

### Manual Camera Enrollment
```bash
curl -X POST http://anava-vision/api/v1/cameras/enroll \
  -H "Content-Type: application/json" \
  -d '{"ip": "192.168.1.100", "type": "onvif"}'
```

## Scaling

### Horizontal Scaling
```bash
# Scale API pods
kubectl scale deployment anava-vision -n anava-vision --replicas=10

# Scale WebSocket pods  
kubectl scale deployment anava-vision-websocket -n anava-vision --replicas=5
```

### Vertical Scaling
Edit `values-production.yaml`:
```yaml
resources:
  limits:
    cpu: 2000m
    memory: 4Gi
```

## Backup & Recovery

### Automated Backups
Backups run daily at 2 AM and retain for 30 days.

### Manual Backup
```bash
kubectl exec -n anava-vision deployment/anava-vision -- /app/backup.sh
```

### Restore
```bash
kubectl exec -n anava-vision deployment/anava-vision -- /app/restore.sh backup-2024-01-15.tar.gz
```

## Security

- Network policies enabled by default
- Pod security policies enforced
- Secrets encrypted at rest
- mTLS between services
- Regular vulnerability scanning

## Uninstall

```bash
# Remove Anava Vision
helm uninstall anava-vision -n anava-vision

# Remove namespace
kubectl delete namespace anava-vision

# Remove monitoring (optional)
helm uninstall prometheus -n monitoring
```

## Support

- Documentation: https://docs.anava-vision.com
- Issues: https://github.com/anava-vision/zero-touch/issues
- Email: support@anava-vision.com

## License

Copyright © 2024 Anava Vision. All rights reserved.

---

Built with ❤️ for enterprise security teams