# Cloud Orchestrator - WebRTC Signaling Service

The Cloud Orchestrator is a Node.js service that handles WebRTC signaling between browsers and Edge Gateway devices. It manages device registration, user authentication, and relays signaling messages without touching any video streams.

## Features

- **WebSocket-based signaling**: Real-time communication between browsers and edge devices
- **Firebase Authentication**: Secure user authentication using Firebase Auth
- **Device Registry**: Manages Edge Gateway devices with capabilities and location
- **Session Management**: Tracks active WebRTC sessions and handles cleanup
- **Scalable Architecture**: Designed to handle thousands of concurrent connections
- **Cloud Run Deployment**: Ready for deployment on Google Cloud Run
- **Health Monitoring**: Built-in health checks and metrics

## Architecture

```
Browser Client ←→ Cloud Orchestrator ←→ Edge Gateway
                       ↓
                   Firebase Auth
                       ↓
                   Firestore DB
                       ↓
                   Redis (optional)
```

## Getting Started

### Prerequisites

- Node.js 18+
- Firebase project with Firestore enabled
- Google Cloud Project (for deployment)
- Redis instance (optional, for scaling)

### Local Development

1. **Clone and install dependencies:**
   ```bash
   cd cloud-orchestrator
   npm install
   ```

2. **Set up environment:**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Configure Firebase:**
   - Download service account key from Firebase Console
   - Set `GOOGLE_APPLICATION_CREDENTIALS` to the key file path
   - Set `FIREBASE_PROJECT_ID` to your project ID

4. **Start the server:**
   ```bash
   npm run dev
   ```

The service will be available at `http://localhost:8080`

### API Endpoints

#### Health Check
```http
GET /health
```
Returns service health status and metrics.

#### Device Management
```http
POST /api/devices/register
Authorization: Bearer <firebase-token>
Content-Type: application/json

{
  "deviceId": "edge-gateway-001",
  "capabilities": {
    "hasCamera": true,
    "hasMotionSensor": true
  },
  "location": {
    "latitude": 37.7749,
    "longitude": -122.4194
  }
}
```

```http
GET /api/devices
Authorization: Bearer <firebase-token>
```

```http
DELETE /api/devices/:deviceId
Authorization: Bearer <firebase-token>
```

### WebSocket Protocol

#### Authentication
```json
{
  "type": "auth",
  "token": "<firebase-id-token>",
  "clientType": "browser" | "edge-gateway",
  "deviceId": "<device-id>" // required for edge-gateway
}
```

#### Device Request (Browser)
```json
{
  "type": "request-device",
  "requirements": {
    "capabilities": {
      "hasCamera": true
    },
    "location": {
      "latitude": 37.7749,
      "longitude": -122.4194
    },
    "maxDistance": 50
  }
}
```

#### WebRTC Signaling
```json
{
  "type": "offer" | "answer" | "ice-candidate",
  "sessionId": "<session-id>",
  "sdp": "<sdp-data>", // for offer/answer
  "candidate": "<ice-candidate>" // for ice-candidate
}
```

## Deployment

### Google Cloud Run

1. **Set up gcloud CLI:**
   ```bash
   gcloud auth login
   gcloud config set project YOUR_PROJECT_ID
   ```

2. **Deploy using the script:**
   ```bash
   chmod +x deployment/deploy.sh
   ./deployment/deploy.sh
   ```

3. **Or deploy manually:**
   ```bash
   # Build and push
   gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/cloud-orchestrator

   # Deploy
   gcloud run deploy cloud-orchestrator \
     --image gcr.io/YOUR_PROJECT_ID/cloud-orchestrator \
     --platform managed \
     --region us-central1 \
     --allow-unauthenticated
   ```

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `NODE_ENV` | Environment (development/production) | No |
| `PORT` | Server port (default: 8080) | No |
| `FIREBASE_PROJECT_ID` | Firebase project ID | Yes |
| `REDIS_URL` | Redis connection URL | No |
| `ALLOWED_ORIGINS` | CORS allowed origins | No |
| `MAX_CONNECTIONS` | Maximum WebSocket connections | No |
| `LOG_LEVEL` | Logging level (debug/info/warn/error) | No |

## Client Integration

### Browser Client

```javascript
import { CloudOrchestratorClient } from './cloud-orchestrator-client';

const client = new CloudOrchestratorClient('wss://your-service-url', firebaseAuth);

// Connect and request device
await client.connect();
await client.requestDevice({
  capabilities: { hasCamera: true }
});
```

### Edge Gateway Client

```javascript
const { EdgeGatewayClient } = require('./edge-gateway-client');

const client = new EdgeGatewayClient(
  'wss://your-service-url',
  'edge-gateway-001',
  './service-account.json'
);

// Register device and connect
await client.registerDevice(capabilities, location);
await client.connect();
```

## Monitoring and Scaling

### Health Checks
- Endpoint: `/health`
- Checks: Memory usage, connection count, Firebase connectivity
- Alerts: Configure based on health status

### Scaling Considerations
- **Horizontal scaling**: Cloud Run auto-scales based on traffic
- **Connection limits**: Configure `MAX_CONNECTIONS` per instance
- **Redis**: Use for distributed state when scaling beyond single instance
- **Load balancing**: Cloud Run handles this automatically

### Metrics to Monitor
- Active WebSocket connections
- Session creation/destruction rate
- Memory and CPU usage
- Error rates and response times
- Device registration/deregistration events

## Security

- **Authentication**: All connections require valid Firebase tokens
- **CORS**: Configurable allowed origins
- **Rate limiting**: Built-in rate limiting for API endpoints
- **Input validation**: All WebSocket messages are validated
- **Network security**: Use HTTPS/WSS in production

## Troubleshooting

### Common Issues

1. **Authentication failures**: Check Firebase project configuration and token validity
2. **Connection issues**: Verify WebSocket URL and network connectivity
3. **Device not found**: Ensure device is registered and online
4. **Session timeouts**: Check network stability and session timeout settings

### Debug Mode
```bash
DEBUG=cloud-orchestrator:* npm start
```

### Logs
- Production logs are JSON formatted for Cloud Logging
- Development logs are human-readable
- Configure log level with `LOG_LEVEL` environment variable

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Test deployment before submitting PR

## License

MIT License - see LICENSE file for details