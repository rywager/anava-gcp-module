# Anava Vision Enterprise Installer

## Overview

This is a production-ready, zero-configuration installer for Anava Vision - an enterprise-grade computer vision platform with automatic camera discovery, real-time streaming, and comprehensive monitoring.

## Features

- **Zero Manual Configuration**: One-click installation with automatic setup
- **Camera Auto-Discovery**: Automatic detection of IP cameras with digest authentication
- **Enterprise Security**: SSL/TLS encryption, authentication, and firewall configuration
- **High Availability**: Docker Swarm ready with health checks and auto-recovery
- **Comprehensive Monitoring**: Prometheus, Grafana, and Loki for metrics and logs
- **Automatic Updates**: Scheduled updates with rollback capabilities
- **Production Ready**: Optimized for performance and reliability

## System Requirements

- **OS**: Ubuntu 20.04+ or Debian 10+
- **CPU**: Minimum 4 cores (8+ recommended)
- **RAM**: Minimum 8GB (16GB+ recommended)
- **Storage**: Minimum 50GB (100GB+ recommended for video storage)
- **Network**: Static IP address and domain name

## Quick Start

1. **Download the installer**:
   ```bash
   git clone https://github.com/anava-vision/enterprise-installer.git
   cd enterprise-installer
   ```

2. **Run the installer**:
   ```bash
   sudo chmod +x install.sh
   sudo ./install.sh
   ```

3. **Follow the prompts**:
   - Enter your domain name (e.g., example.com)
   - Enter your email for SSL certificates
   - The installer will handle everything else automatically

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Internet                              │
└─────────────────────┬───────────────────────────────────────┘
                      │
              ┌───────▼────────┐
              │   Traefik      │
              │ Reverse Proxy  │
              │   (SSL/TLS)    │
              └───────┬────────┘
                      │
    ┌─────────────────┼─────────────────────────┐
    │                 │                         │
┌───▼────┐     ┌──────▼──────┐         ┌───────▼────────┐
│  Web   │     │     API     │         │    WebRTC      │
│  App   │     │   Server    │         │   Signaling    │
└───┬────┘     └──────┬──────┘         └────────┬───────┘
    │                 │                          │
    └─────────────────┼──────────────────────────┘
                      │
              ┌───────▼────────┐
              │     Redis      │
              │    Cache       │
              └───────┬────────┘
                      │
              ┌───────▼────────┐
              │   PostgreSQL   │
              │   Database     │
              └────────────────┘

┌─────────────────────────────────────────────────┐
│              Camera Network                      │
│                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Camera 1 │  │ Camera 2 │  │ Camera N │      │
│  │  (Axis)  │  │  (Axis)  │  │   (IP)   │      │
│  └──────────┘  └──────────┘  └──────────┘      │
│                                                  │
│              ┌──────────────┐                   │
│              │  Supervisor  │                   │
│              │   Service    │                   │
│              │(Auto-Discovery)                  │
│              └──────────────┘                   │
└─────────────────────────────────────────────────┘
```

## Components

### Core Services

1. **Supervisor Service** (`supervisor.py`)
   - Automatic camera discovery using network scanning
   - Digest authentication support for Axis cameras
   - Health monitoring and status updates
   - Dynamic configuration generation

2. **Traefik Reverse Proxy**
   - Automatic SSL certificate management
   - Load balancing and routing
   - Security headers and rate limiting

3. **Application Stack**
   - Web application (React/Next.js)
   - API server (Node.js/Express)
   - WebRTC signaling server
   - Stream processing service

4. **Data Layer**
   - PostgreSQL for persistent storage
   - Redis for caching and sessions
   - Volume mounts for video storage

### Monitoring Stack

1. **Prometheus** - Metrics collection and alerting
2. **Grafana** - Visualization and dashboards
3. **Loki** - Log aggregation and search
4. **Promtail** - Log shipping

### Security Features

- Automatic firewall configuration (UFW)
- Fail2ban for intrusion prevention
- SSL/TLS encryption for all services
- Secure password generation
- Role-based access control

## Configuration

### Camera Configuration

Cameras are automatically discovered and saved to `/etc/anava-vision/cameras.yaml`:

```yaml
cameras:
  - id: "a1b2c3d4"
    name: "Camera-a1b2c3d4"
    ip: "192.168.50.156"
    port: 80
    username: "root"
    password: "pass"
    rtsp_url: "rtsp://root:pass@192.168.50.156:554/axis-media/media.amp"
    model: "AXIS P3245"
    manufacturer: "Axis"
    capabilities: ["rtsp", "digest_auth", "h264"]
    status: "online"
```

### Environment Variables

All configuration is stored in `/opt/anava-vision/.env`:

```bash
# Domain Configuration
DOMAIN=example.com
EMAIL=admin@example.com

# Security (auto-generated)
DB_PASSWORD=<generated>
REDIS_PASSWORD=<generated>
JWT_SECRET=<generated>

# Monitoring
GRAFANA_USER=admin
GRAFANA_PASSWORD=<generated>

# Email Notifications
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
```

## Management

### Service Control

```bash
# Check service status
sudo systemctl status anava-vision

# Restart services
sudo systemctl restart anava-vision

# View logs
sudo journalctl -u anava-vision -f

# Docker compose commands
cd /opt/anava-vision
sudo docker compose ps
sudo docker compose logs -f
```

### Manual Camera Discovery

```bash
# Trigger manual discovery
sudo docker exec anava-supervisor python3 -c "
from supervisor import CameraDiscovery
import asyncio
discovery = CameraDiscovery()
asyncio.run(discovery.discover_cameras())
"
```

### Backup and Restore

```bash
# Backup
sudo /opt/anava-vision/backup.sh

# Restore
sudo /opt/anava-vision/restore.sh <backup-file>
```

## Monitoring

### Access Points

- **Main Application**: https://your-domain.com
- **API**: https://api.your-domain.com
- **Traefik Dashboard**: https://traefik.your-domain.com
- **Grafana**: https://grafana.your-domain.com
- **Prometheus**: https://prometheus.your-domain.com

### Default Dashboards

1. **System Overview** - CPU, memory, disk usage
2. **Camera Status** - Online/offline cameras, stream health
3. **Application Metrics** - Request rates, response times
4. **Security Events** - Failed logins, blocked IPs

## Troubleshooting

### Common Issues

1. **Camera not discovered**
   - Check network connectivity
   - Verify camera is on same subnet
   - Check firewall rules
   - Review supervisor logs

2. **SSL certificate issues**
   - Ensure domain DNS is configured
   - Check Traefik logs
   - Verify email address is valid

3. **High resource usage**
   - Adjust stream quality settings
   - Enable stream transcoding
   - Scale horizontally with Docker Swarm

### Debug Commands

```bash
# Check supervisor logs
docker logs anava-supervisor

# Test camera connectivity
docker exec anava-supervisor ping <camera-ip>

# View discovered cameras
cat /etc/anava-vision/cameras.yaml

# Check service health
docker compose ps
curl -f http://localhost/health
```

## Updates

The system automatically checks for updates daily at 2 AM. To manually update:

```bash
cd /opt/anava-vision
sudo ./update.sh
```

Update configuration is managed in `auto-updater.yml`.

## Security Considerations

1. **Change default passwords** immediately after installation
2. **Configure firewall rules** for your specific network
3. **Enable 2FA** for admin accounts
4. **Regular backups** of configuration and data
5. **Monitor security logs** in Grafana

## Support

- Documentation: https://docs.anava.vision
- Issues: https://github.com/anava-vision/enterprise-installer/issues
- Email: support@anava.vision

## License

Copyright (c) 2024 Anava Vision. All rights reserved.