# Anava Vision Desktop

A professional desktop application for camera management, ACAP deployment, and WebRTC orchestration. Built with Electron and React.

## Features

- **Camera Discovery**: Automatically discover Axis cameras on your network
- **ACAP Deployment**: Deploy and manage ACAP applications with progress tracking
- **WebRTC Orchestrator**: Built-in WebRTC signaling server for peer-to-peer connections
- **Chat Interface**: Real-time chat with camera-deployed applications
- **Mobile QR Codes**: Generate QR codes for mobile device connections
- **Cross-Platform**: Works on macOS, Windows, and Linux
- **Auto-Updater**: Automatic application updates

## Installation

### Prerequisites

- Node.js 16+ 
- npm or yarn
- Git

### Development Setup

1. Clone the repository:
```bash
git clone https://github.com/anava/anava-desktop-app.git
cd anava-desktop-app
```

2. Install dependencies:
```bash
npm install
```

3. Start the development environment:
```bash
npm run dev
```

This will start both the React development server and Electron application.

## Building

### Build for Current Platform

```bash
npm run build
```

### Build for All Platforms

```bash
npm run build-all
```

### Platform-Specific Builds

```bash
# macOS
npm run build-mac

# Windows
npm run build-win

# Linux
npm run build-linux
```

## Architecture

### Main Process (Electron)

- **Camera Discovery Service**: Network scanning and camera detection
- **ACAP Deployment Service**: Package upload and management
- **WebRTC Orchestrator**: Signaling server for peer connections
- **QR Code Service**: Generate QR codes for mobile connections
- **Auto-Updater**: Handle application updates

### Renderer Process (React)

- **Dashboard**: Overview of system status and statistics
- **Camera Discovery**: Network scanning and camera management
- **ACAP Deployment**: Upload and deploy applications
- **WebRTC Orchestrator**: Manage peer connections and rooms
- **Chat Interface**: Real-time communication with cameras
- **Settings**: Application configuration

## Services

### Camera Discovery

Automatically scans network ranges to find Axis cameras:

- Ping sweep to find active hosts
- HTTP requests to detect camera endpoints
- Parse camera information and capabilities
- Store discovered cameras with credentials

### ACAP Deployment

Deploy ACAP applications to cameras:

- Upload .eap files via HTTP
- Real-time progress tracking
- Installation and configuration
- Start/stop/uninstall management

### WebRTC Orchestrator

Built-in signaling server for WebRTC:

- Socket.IO and WebSocket support
- Room management
- Peer connection handling
- ICE candidate exchange

### QR Code Generation

Generate QR codes for mobile connections:

- Camera connection QR codes
- Mobile app connection
- WebRTC session codes
- Branded QR codes with Anava styling

## Configuration

### Network Settings

- Discovery timeout and retry settings
- Default camera credentials
- Connection timeout values

### WebRTC Settings

- STUN/TURN server configuration
- Port settings
- Logging options

### ACAP Settings

- Deployment timeouts
- Auto-start options
- Backup configuration

## Development

### Project Structure

```
anava-desktop-app/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── main.js          # Main application entry
│   │   ├── preload.js       # Preload script
│   │   └── services/        # Backend services
│   └── renderer/            # React application
│       ├── src/
│       │   ├── components/  # React components
│       │   ├── context/     # React context providers
│       │   └── types/       # TypeScript type definitions
│       └── public/          # Static assets
├── assets/                  # Application icons and resources
├── build/                   # Build configuration
├── scripts/                 # Build and development scripts
└── dist/                    # Build output
```

### Adding New Features

1. Create service in `src/main/services/`
2. Add IPC handlers in main process
3. Create React components in `src/renderer/src/components/`
4. Update context providers for state management
5. Add TypeScript types in `src/renderer/src/types/`

### Testing

```bash
# Run React tests
cd src/renderer
npm test

# Run Electron tests
npm run test:electron
```

## Code Signing

### macOS

1. Install certificates in Keychain
2. Update `electron-builder.json` with certificate details
3. Build with signing:

```bash
npm run build-mac
```

### Windows

1. Obtain code signing certificate
2. Configure certificate in environment variables
3. Build with signing:

```bash
npm run build-win
```

## Deployment

### GitHub Releases

1. Configure GitHub token in environment
2. Update version in `package.json`
3. Build and publish:

```bash
npm run build
npm run publish
```

### Manual Distribution

Build files are available in the `dist/` directory:

- **macOS**: `.dmg` and `.zip` files
- **Windows**: `.exe` installer and portable
- **Linux**: `.AppImage`, `.deb`, and `.rpm`

## Troubleshooting

### Common Issues

1. **Camera Discovery Not Working**
   - Check network connectivity
   - Verify camera credentials
   - Ensure cameras are on same network

2. **ACAP Deployment Fails**
   - Verify .eap file is valid
   - Check camera authentication
   - Ensure camera supports ACAP

3. **WebRTC Connection Issues**
   - Check firewall settings
   - Verify STUN/TURN server configuration
   - Ensure ports are not blocked

### Debug Mode

Start with debug logging:

```bash
DEBUG=* npm run dev
```

## License

MIT License - see LICENSE file for details.

## Support

- GitHub Issues: https://github.com/anava/anava-desktop-app/issues
- Documentation: https://docs.anava.com/desktop-app
- Email: support@anava.com