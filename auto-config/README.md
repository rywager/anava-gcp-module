# Anava Vision Auto-Configuration System

A comprehensive automatic configuration system for Anava Vision that discovers and configures everything automatically.

## Features

### 1. Camera Discovery Service
- **Multi-method discovery**: UPnP/SSDP, Bonjour/mDNS, Axis Discovery Protocol (ADP)
- **Network scanning**: Configurable network range scanning
- **Digest authentication support**: Full support for Axis camera authentication
- **RTSP stream discovery**: Automatic detection of RTSP URLs
- **Comprehensive device info**: Model, serial, firmware, capabilities

### 2. WebSocket Path Auto-Configuration
- **Automatic endpoint discovery**: Tests multiple WebSocket paths
- **Protocol support**: Both ws:// and wss://
- **Performance testing**: Latency measurement and stream quality analysis
- **Optimal endpoint selection**: Chooses best endpoint based on performance
- **Model-specific paths**: Supports camera model-specific WebSocket paths

### 3. Dynamic PWA Configuration
- **Runtime configuration**: No rebuilds required
- **Real-time updates**: Configuration changes propagate immediately
- **API endpoints**: RESTful API for configuration management
- **Auto-reload**: PWA automatically detects and applies config changes
- **Service worker integration**: Dynamic service worker generation

### 4. Certificate Management
- **SSL/TLS scanning**: Discovers all certificates in use
- **Self-signed cert handling**: Automatic trust store management
- **Expiry monitoring**: Alerts for expiring certificates
- **CA bundle generation**: Creates custom CA bundle with all certs
- **Certificate validation**: Comprehensive validation and reporting

### 5. Health Monitoring & Auto-Recovery
- **System resource monitoring**: CPU, memory, disk usage
- **Camera connectivity checks**: Continuous connectivity monitoring
- **WebSocket health checks**: Validates WebSocket connections
- **Service monitoring**: Monitors all running services
- **Automatic recovery**: Self-healing capabilities
- **Alert system**: Configurable alerts via webhooks

## Installation

```bash
# Clone the repository
cd /Users/ryanwager/terraform-installer/auto-config

# Install dependencies
pip3 install -r requirements.txt
```

## Usage

### Quick Start

```bash
# Run with defaults (username: root, password: admin, network: 192.168.1.0/24)
python3 auto_config_orchestrator.py

# Run with custom credentials
python3 auto_config_orchestrator.py --username myuser --password mypass --network 10.0.0.0/24

# Run with config file
python3 auto_config_orchestrator.py --config-file config.json
```

### Configuration File Example

```json
{
  "username": "root",
  "password": "your-password",
  "network": "192.168.1.0/24",
  "pwa_port": 8080,
  "health_check_interval": 30,
  "certificate_warning_days": 30
}
```

### Individual Components

You can also run components individually:

```bash
# Camera Discovery only
python3 camera_discovery.py root password 192.168.1.0/24

# WebSocket Configuration (requires discovered_cameras.json)
python3 websocket_configurator.py root password

# PWA Config Server
python3 dynamic_pwa_config.py

# Certificate Manager
python3 certificate_manager.py

# Health Monitor
python3 health_monitor.py
```

## API Endpoints

The PWA Configuration Server provides these endpoints:

- `GET /api/config` - Get current configuration
- `POST /api/config` - Update configuration
- `GET /api/config/version` - Get config version (for polling)
- `GET /api/cameras` - Get camera list
- `POST /api/cameras` - Update camera list
- `GET /api/health` - Health check endpoint
- `POST /api/auth/token` - Generate JWT token
- `GET /config.js` - Dynamic JavaScript config
- `GET /service-worker.js` - Dynamic service worker
- `GET /manifest.json` - Dynamic PWA manifest

## Output Files

The system generates several output files:

- `discovered_cameras.json` - List of discovered cameras
- `websocket_config.json` - WebSocket endpoint configurations
- `certificate_report.json` - Certificate scan results
- `health_report.json` - System health report
- `certificates/` - Directory containing saved certificates

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                 Auto-Config Orchestrator                 │
├─────────────┬──────────────┬─────────────┬──────────────┤
│   Camera    │  WebSocket   │    PWA      │ Certificate  │
│  Discovery  │ Configurator │   Config    │   Manager    │
├─────────────┴──────────────┴─────────────┴──────────────┤
│                   Health Monitor                         │
└─────────────────────────────────────────────────────────┘
```

## Workflow

1. **Discovery Phase**: Scans network for Axis cameras using multiple protocols
2. **WebSocket Configuration**: Tests and configures optimal WebSocket endpoints
3. **Certificate Scan**: Scans and manages SSL/TLS certificates
4. **PWA Server Start**: Launches dynamic configuration server
5. **Health Monitoring**: Begins continuous health monitoring
6. **Auto-Recovery**: Handles failures and performs automatic recovery

## Security Considerations

- Credentials are stored in memory only during runtime
- SSL/TLS certificates are validated and managed
- JWT tokens for API authentication
- Configurable certificate trust policies

## Troubleshooting

### No cameras discovered
- Check network connectivity
- Verify credentials
- Ensure cameras are on the specified network
- Check firewall rules

### WebSocket connection failures
- Verify camera firmware supports WebSocket
- Check authentication credentials
- Ensure network allows WebSocket traffic

### Certificate issues
- Self-signed certificates are automatically handled
- Check certificate expiry dates
- Verify certificate chain validity

### Health monitoring alerts
- Check system resources (CPU, memory, disk)
- Verify network connectivity
- Check service logs for errors

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License