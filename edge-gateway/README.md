# Edge Gateway Service

A production-ready edge gateway service that auto-discovers Axis cameras on the local network, converts RTSP streams to WebRTC, and maintains outbound-only connections to a cloud orchestrator.

## Features

- **Auto-Discovery**: Automatically finds Axis cameras using mDNS/Bonjour and network scanning
- **RTSP to WebRTC**: High-performance real-time streaming conversion
- **Outbound-Only**: No inbound ports required - maintains WebSocket connection to cloud
- **PTZ Control**: Full PTZ (Pan-Tilt-Zoom) command support via DataChannel
- **Multi-Architecture**: Supports both ARM64 (Raspberry Pi) and AMD64 platforms
- **Production Ready**: Complete error handling, reconnection logic, and resource management

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────────┐
│   Axis Cameras  │◄──►│   Edge Gateway   │◄──►│ Cloud Orchestrator  │
│   (RTSP/PTZ)    │    │  (RTSP→WebRTC)   │    │   (WebSocket)       │
└─────────────────┘    └──────────────────┘    └─────────────────────┘
                               │
                               ▼
                       ┌──────────────────┐
                       │   Web Clients    │
                       │   (WebRTC)       │
                       └──────────────────┘
```

## Quick Start

1. **Clone and Configure**:
   ```bash
   cd /Users/ryanwager/terraform-installer/edge-gateway
   cp .env.example .env
   # Edit .env with your settings
   ```

2. **Deploy with Docker Compose**:
   ```bash
   docker-compose up -d
   ```

3. **Monitor Logs**:
   ```bash
   docker-compose logs -f edge-gateway
   ```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `CLOUD_ORCHESTRATOR_URL` | WebSocket URL of cloud orchestrator | `wss://orchestrator.example.com/gateway` |
| `CAMERA_USERNAME` | Default username for camera authentication | `root` |
| `CAMERA_PASSWORD` | Default password for camera authentication | `pass` |
| `GATEWAY_LOCATION` | Human-readable location identifier | `Unknown` |
| `GATEWAY_DESCRIPTION` | Description of this gateway instance | `Edge Gateway` |
| `LOG_LEVEL` | Logging verbosity (debug, info, warn, error) | `info` |

### Camera Discovery

The gateway automatically discovers Axis cameras using:

1. **mDNS/Bonjour**: Searches for `_axis-video._tcp`, `_rtsp._tcp`, and `_http._tcp` services
2. **Network Scanning**: Scans local subnets for devices with RTSP on port 554
3. **Continuous Monitoring**: Periodically rescans for new cameras

### PTZ Commands

Supported PTZ commands via DataChannel:
- `pan_left` / `pan_right`
- `tilt_up` / `tilt_down`
- `zoom_in` / `zoom_out`
- `stop`

All commands accept a `speed` parameter (0.0 to 1.0).

## WebSocket Protocol

### Gateway → Cloud Messages

#### Camera Status
```json
{
  "type": "camera_status",
  "payload": {
    "camera": {
      "id": "axis-192-168-1-100",
      "name": "Front Door Camera",
      "model": "AXIS P1435-LE",
      "ip": "192.168.1.100",
      "port": 554,
      "rtsp_url": "rtsp://root:pass@192.168.1.100:554/axis-media/media.amp",
      "has_ptz": true
    },
    "status": "discovered"
  }
}
```

#### WebRTC Answer
```json
{
  "type": "webrtc_answer",
  "payload": {
    "camera_id": "axis-192-168-1-100",
    "sdp": { /* WebRTC SDP */ }
  }
}
```

#### ICE Candidate
```json
{
  "type": "ice_candidate",
  "payload": {
    "camera_id": "axis-192-168-1-100",
    "candidate": { /* ICE candidate */ }
  }
}
```

### Cloud → Gateway Messages

#### Start Stream
```json
{
  "type": "start_stream",
  "payload": {
    "camera_id": "axis-192-168-1-100"
  }
}
```

#### WebRTC Offer
```json
{
  "type": "webrtc_offer",
  "payload": {
    "camera_id": "axis-192-168-1-100",
    "sdp": { /* WebRTC SDP */ }
  }
}
```

#### PTZ Command
```json
{
  "type": "ptz_command",
  "payload": {
    "camera_id": "axis-192-168-1-100",
    "action": "pan_left",
    "speed": 0.5
  }
}
```

## Building from Source

### Prerequisites
- Go 1.21+
- Docker (for containerized deployment)

### Build Binary
```bash
go mod download
go build -o edge-gateway main.go
```

### Build Docker Image
```bash
# For current platform
docker build -t edge-gateway .

# For multi-platform
docker buildx build --platform linux/amd64,linux/arm64 -t edge-gateway .
```

## Deployment Options

### Raspberry Pi
```bash
# Set ARM64 platform specifically
docker-compose up -d
```

### Standard Linux Server
```bash
# Default AMD64 platform
docker-compose up -d
```

### With Auto-Updates
```bash
# Enable Watchtower for automatic updates
docker-compose --profile auto-update up -d
```

## Security Considerations

- **Outbound Only**: No inbound ports exposed to internet
- **Authentication**: Uses camera credentials for RTSP access
- **TLS**: WebSocket connection uses WSS (secure WebSocket)
- **Non-Root**: Container runs as non-root user
- **Resource Limits**: CPU and memory limits prevent resource exhaustion

## Monitoring

### Health Checks
- Container health check via process monitoring
- WebSocket connection monitoring with auto-reconnect
- RTSP stream health monitoring

### Logs
```bash
# View live logs
docker-compose logs -f edge-gateway

# View specific time range
docker-compose logs --since 1h edge-gateway
```

### Metrics
The gateway logs key metrics:
- Camera discovery events
- Stream start/stop events
- WebRTC connection establishment
- PTZ command execution
- Error rates and reconnection attempts

## Troubleshooting

### Common Issues

1. **No Cameras Discovered**
   - Check camera credentials in `.env`
   - Verify cameras are on same network
   - Check firewall rules for mDNS traffic

2. **WebSocket Connection Failed**
   - Verify `CLOUD_ORCHESTRATOR_URL` is correct
   - Check internet connectivity
   - Verify cloud orchestrator is running

3. **RTSP Stream Issues**
   - Check camera RTSP URL format
   - Verify camera supports H.264 encoding
   - Check network bandwidth

4. **PTZ Commands Not Working**
   - Verify camera supports PTZ
   - Check camera PTZ configuration
   - Verify user has PTZ permissions

### Debug Mode
Enable debug logging:
```bash
# Set in .env file
LOG_LEVEL=debug

# Restart service
docker-compose restart edge-gateway
```

## License

This software is proprietary and confidential. Unauthorized copying, distribution, or use is strictly prohibited.