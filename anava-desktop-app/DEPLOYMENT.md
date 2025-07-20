# Anava Vision Desktop - Deployment Guide

## Overview

This document outlines the complete deployment process for the Anava Vision Desktop application, a professional Electron-based application for camera management, ACAP deployment, and WebRTC orchestration.

## Quick Start

### Development

```bash
# Install dependencies
npm install

# Start development environment
npm run dev
```

### Production Build

```bash
# Build for current platform
npm run build

# Build for all platforms
npm run build-all
```

## Architecture

### Main Process (Node.js/Electron)
- **Camera Discovery Service**: Network scanning with ping and HTTP detection
- **ACAP Deployment Service**: Upload, install, and manage ACAP applications
- **WebRTC Orchestrator**: Built-in signaling server with Socket.IO and WebSocket
- **QR Code Service**: Generate mobile connection QR codes
- **Auto-Updater**: Automatic application updates

### Renderer Process (React/TypeScript)
- **Dashboard**: System overview and statistics
- **Camera Discovery**: Network scanning and camera management
- **ACAP Deployment**: Application deployment with progress tracking
- **WebRTC Orchestrator**: Peer connection management
- **Chat Interface**: Real-time communication with cameras
- **Settings**: Application configuration

## Key Features

### 1. Camera Discovery
- Automatic network scanning for Axis cameras
- Multi-threaded ping sweep and HTTP detection
- Camera capability detection (ACAP, ONVIF, RTSP)
- Credential management and authentication

### 2. ACAP Deployment
- Upload .eap files via HTTP multipart
- Real-time progress tracking with callbacks
- Installation, configuration, and startup
- Package management (start/stop/uninstall)
- Deployment history and logging

### 3. WebRTC Orchestrator
- Built-in signaling server on configurable port
- Socket.IO and WebSocket support
- Room and peer management
- ICE candidate exchange
- Connection monitoring and statistics

### 4. Chat Interface
- Real-time messaging with camera applications
- Message history and persistence
- Multi-camera support
- QR code generation for mobile connections

### 5. Mobile Integration
- QR code generation for various connection types
- Mobile app connection support
- WebRTC session codes
- Branded QR codes with Anava styling

## File Structure

```
anava-desktop-app/
├── src/
│   ├── main/                          # Electron main process
│   │   ├── main.js                   # Application entry point
│   │   ├── preload.js                # Secure IPC bridge
│   │   └── services/                 # Backend services
│   │       ├── cameraDiscovery.js    # Network scanning
│   │       ├── acapDeployment.js     # ACAP management
│   │       ├── webrtcOrchestrator.js # WebRTC signaling
│   │       └── qrCodeService.js      # QR code generation
│   └── renderer/                      # React application
│       ├── src/
│       │   ├── components/           # React components
│       │   ├── context/              # State management
│       │   └── types/                # TypeScript definitions
│       └── public/                   # Static assets
├── assets/                           # Application icons
├── build/                            # Build configuration
├── scripts/                          # Build and dev scripts
├── electron-builder.json            # Build configuration
└── package.json                     # Dependencies and scripts
```

## Configuration

### Network Settings
- Discovery timeout: 5000ms
- Connection timeout: 10000ms
- Retry attempts: 3
- Default credentials: root/pass

### WebRTC Settings
- Default port: 8080
- STUN servers: Google public STUN
- TURN servers: Configurable
- Logging: Optional debug logging

### ACAP Settings
- Deployment timeout: 300000ms (5 minutes)
- Auto-start: Enabled
- Backup on update: Enabled

## Build Process

### 1. Environment Setup
- Node.js 16+ required
- Platform-specific build tools (Xcode, Visual Studio, etc.)
- Code signing certificates (optional)

### 2. Dependencies
```bash
npm install                    # Main dependencies
cd src/renderer && npm install # React dependencies
```

### 3. Build Commands
```bash
npm run build                  # Current platform
npm run build-all             # All platforms
npm run build-mac             # macOS only
npm run build-win             # Windows only
npm run build-linux           # Linux only
```

### 4. Output Files
- **macOS**: `.dmg` installer, `.zip` archive
- **Windows**: `.exe` installer, portable `.exe`
- **Linux**: `.AppImage`, `.deb`, `.rpm` packages

## Security Considerations

### Code Signing
- macOS: Developer ID certificates in Keychain
- Windows: Code signing certificates
- Linux: GPG signing (optional)

### Electron Security
- Context isolation enabled
- Node integration disabled in renderer
- Secure preload script for IPC
- Content Security Policy

### Network Security
- Camera credential encryption
- HTTPS where possible
- Secure WebSocket connections
- Input validation and sanitization

## Deployment Options

### 1. GitHub Releases
- Automatic releases via GitHub Actions
- Update server integration
- Version management

### 2. Manual Distribution
- Direct download from website
- Corporate deployment
- Offline installation

### 3. Package Managers
- macOS: Homebrew Cask
- Windows: Chocolatey, Scoop
- Linux: Snap, Flatpak

## Auto-Updates

### Configuration
- GitHub releases as update source
- Automatic update checking
- User consent for updates
- Rollback capability

### Update Process
1. Check for updates on startup
2. Download updates in background
3. Notify user when ready
4. Apply updates on restart

## Troubleshooting

### Common Issues
1. **Camera Discovery Fails**
   - Check network connectivity
   - Verify camera accessibility
   - Confirm credentials

2. **ACAP Deployment Errors**
   - Validate .eap file format
   - Check camera ACAP support
   - Verify authentication

3. **WebRTC Connection Issues**
   - Check firewall settings
   - Verify STUN/TURN configuration
   - Network connectivity

### Debug Mode
```bash
DEBUG=* npm run dev
```

### Logging
- Electron logs in OS-specific locations
- Application logs stored in user data
- WebRTC debug logging available

## Performance Optimization

### Camera Discovery
- Parallel network scanning
- Configurable timeout values
- Efficient ping implementation
- Connection pooling

### ACAP Deployment
- Streaming file uploads
- Progress tracking
- Error handling and recovery
- Batch operations

### WebRTC Orchestrator
- Efficient message routing
- Connection cleanup
- Memory management
- Scalable architecture

## Maintenance

### Updates
- Regular security updates
- Feature enhancements
- Bug fixes and improvements
- Performance optimizations

### Monitoring
- Error tracking and reporting
- Performance metrics
- Usage analytics
- User feedback integration

## Support

### Documentation
- User manual and guides
- API documentation
- Troubleshooting guides
- Video tutorials

### Community
- GitHub issues and discussions
- Community forums
- Developer support
- Feature requests

## License and Legal

- MIT License
- Third-party licenses
- Compliance requirements
- Privacy considerations

## Conclusion

The Anava Vision Desktop application provides a comprehensive solution for camera management and WebRTC orchestration. With its professional UI, robust backend services, and cross-platform compatibility, it serves as a complete replacement for Docker-based approaches while maintaining ease of use and powerful functionality.

The application is designed for scalability, security, and maintainability, making it suitable for both individual users and enterprise deployments.