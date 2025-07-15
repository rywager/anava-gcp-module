# Anava Vision PWA

A production-ready Progressive Web App for professional camera control with PTZ support.

## Features

✨ **Modern PWA Features**
- 📱 Installable on mobile and desktop
- 🔄 Offline support with service worker
- 🔔 Push notifications for alerts
- ⚡ Fast loading and caching

🎥 **Camera Control**
- 📹 WebRTC video streaming
- 🎛️ PTZ (Pan-Tilt-Zoom) controls with virtual joystick
- 📷 Camera list from orchestrator service
- 🎯 Preset positions
- 📸 Snapshot capture

🎨 **Beautiful UI**
- 🌙 Dark theme with gradient design
- 📱 Mobile-first responsive design
- ✨ Smooth animations with Framer Motion
- 🎨 Modern glassmorphism effects

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Edit `.env` file to set your orchestrator URL:
```bash
REACT_APP_ORCHESTRATOR_URL=http://your-orchestrator-url/api
```

### 3. Development
```bash
npm start
```
Open [http://localhost:3000](http://localhost:3000) to view in the browser.

### 4. Production Build
```bash
npm run build:pwa
```

### 5. Serve Production Build
```bash
npm run serve
```

## PWA Installation

### Desktop (Chrome/Edge)
1. Click the install icon in the address bar
2. Or go to Settings → Install Anava Vision

### Mobile (iOS)
1. Open in Safari
2. Tap Share button
3. Select "Add to Home Screen"

### Mobile (Android)
1. Open in Chrome
2. Tap menu and select "Add to Home Screen"
3. Or use the install prompt

## Configuration

### Environment Variables
- `REACT_APP_ORCHESTRATOR_URL` - Camera orchestrator API URL
- `REACT_APP_ENABLE_DEMO_MODE` - Enable demo cameras for development
- `REACT_APP_ENABLE_NOTIFICATIONS` - Enable push notifications
- `REACT_APP_ENABLE_PWA_FEATURES` - Enable PWA features

### Camera Orchestrator API
The app expects a REST API with these endpoints:
- `GET /api/cameras` - List all cameras
- `GET /api/cameras/:id` - Get camera details
- `POST /api/cameras/:id/stream` - Start WebRTC stream
- `POST /api/cameras/:id/ptz` - Send PTZ commands

## Architecture

### Components
- **App.tsx** - Main application container
- **CameraList** - Camera selection sidebar
- **VideoPlayer** - WebRTC video display with controls
- **PTZControls** - Pan-tilt-zoom control interface
- **InstallPrompt** - PWA installation UI
- **NotificationManager** - Push notification handler

### Contexts
- **CameraContext** - Camera state management
- **WebRTCContext** - Video streaming management

### Services
- **orchestratorService** - API communication
- **serviceWorkerRegistration** - PWA functionality

## Browser Support

- ✅ Chrome 80+
- ✅ Firefox 80+
- ✅ Safari 14+
- ✅ Edge 80+

## Development

### Demo Mode
When orchestrator is unavailable, the app runs in demo mode with:
- Mock camera list
- Simulated video streams
- Working PTZ controls (visual feedback only)

### Testing PWA Features
1. Build the app: `npm run build`
2. Serve over HTTPS (required for PWA)
3. Test on mobile devices
4. Verify service worker registration
5. Test offline functionality

## Deployment

### Static Hosting
Deploy the `build` folder to any static hosting service:
- Netlify
- Vercel
- AWS S3 + CloudFront
- Firebase Hosting

### Docker
```dockerfile
FROM nginx:alpine
COPY build /usr/share/nginx/html
EXPOSE 80
```

### HTTPS Required
PWA features require HTTPS in production. Most hosting services provide this automatically.

## Troubleshooting

### Service Worker Issues
- Clear browser cache and reload
- Check browser developer tools → Application → Service Workers
- Ensure HTTPS in production

### Camera Connection Issues
- Verify orchestrator URL in `.env`
- Check CORS settings on orchestrator
- Ensure WebRTC is supported

### Installation Issues
- Verify manifest.json is accessible
- Check PWA requirements in Lighthouse
- Ensure service worker is registered

## License

Copyright (c) 2025 Anava Vision. All rights reserved.

## Support

For technical support, please contact the development team.
