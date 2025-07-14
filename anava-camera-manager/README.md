# Anava Camera Manager

An Electron application for discovering, deploying, and managing Axis cameras with ACAP applications in the Anava Vision ecosystem.

## Features

- **Network Discovery**: Automatically discover Axis cameras on local networks
- **Visual Topology**: Interactive network topology view of discovered cameras
- **One-Click Deployment**: Deploy BatonDescribe ACAP to multiple cameras simultaneously
- **Real-Time Progress**: Track deployment progress with visual feedback
- **Cloud Integration**: Seamless integration with Anava Vision cloud infrastructure
- **Chat Interface**: Natural language interaction with deployed cameras via MCP

## Prerequisites

- Node.js 16+ and npm
- Access to Anava Vision cloud deployment (terraform outputs)
- Axis cameras on the local network
- VAPIX credentials for cameras

## Installation

```bash
# Install dependencies
npm install

# Build the application
npm run build

# Start the application
npm start
```

## Development

```bash
# Start in development mode with hot reload
npm run dev

# In another terminal, start Electron
npm run electron
```

## Configuration

The application automatically fetches configuration from:

1. Local terraform outputs (`../outputs.json`)
2. Cloud deployment API (if deployment ID is set)
3. Default configuration (for development)

### Setting up a deployment

1. Run the terraform-installer to create cloud infrastructure
2. Set the deployment ID:
   ```bash
   export DEPLOYMENT_ID=your-deployment-id
   ```
3. Or select a deployment from the UI

## Camera Discovery

The application scans common network subnets:
- `192.168.1.0/24`
- `192.168.50.0/24` 
- `10.0.0.0/24`

Test camera: `192.168.50.156` (root:pass)

## ACAP Deployment

The deployment process:

1. **Connect** to camera via VAPIX
2. **Upload** BatonDescribe ACAP package
3. **Install** and start the application
4. **Configure** with cloud settings
5. **Enable** certificate-based authentication

## Chat Interface

Once deployed, cameras support natural language interaction:

- "What do you see right now?"
- "Is anyone in the frame?"
- "Create a skill to monitor the entrance"
- "Alert me when someone enters"

## Building for Distribution

```bash
# Build for current platform
npm run package

# Build for all platforms (requires platform-specific dependencies)
npm run package -- --mac --win --linux
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Electron App                          │
├─────────────────────────────────────────────────────────┤
│  React UI        │  Camera Discovery │  ACAP Deployment │
│  - Camera List   │  - Network Scan   │  - VAPIX Client  │
│  - Topology View │  - VAPIX Check    │  - Progress Track│
│  - Chat UI       │  - Status Monitor │  - Batch Deploy  │
└─────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────┐
│                   Cloud Services                        │
├─────────────────────────────────────────────────────────┤
│  Config API      │  MCP Server       │  Chat Interface  │
│  Certificate CA  │  WebSocket Proxy  │  Skill Builder   │
└─────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────┐
│                   Axis Cameras                          │
├─────────────────────────────────────────────────────────┤
│  BatonDescribe ACAP                                     │
│  - Cloud Config     │  - Certificate Auth              │
│  - MCP Client       │  - Auto Updates                  │
└─────────────────────────────────────────────────────────┘
```

## Security

- Certificate-based authentication for all camera communication
- No credentials stored on cameras
- All sensitive data managed via Google Secret Manager
- mTLS for camera-to-cloud communication

## Troubleshooting

### Camera Discovery Issues
- Ensure cameras are on the same network
- Check firewall settings
- Verify VAPIX credentials

### Deployment Failures
- Check camera disk space
- Verify network connectivity
- Review ACAP compatibility

### Chat Interface Issues
- Ensure MCP server is running
- Check WebSocket connectivity
- Verify camera has deployed ACAP

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test with real cameras
5. Submit a pull request

## License

MIT License - see LICENSE file for details