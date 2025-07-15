# Anava Vision E2E Testing Suite

A comprehensive end-to-end testing framework for the Anava Vision system, including camera discovery, WebSocket connections, WebRTC streaming, PTZ controls, and performance testing.

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Test Suites](#test-suites)
- [Mock Services](#mock-services)
- [Performance Testing](#performance-testing)
- [Configuration](#configuration)
- [CI/CD Integration](#cicd-integration)
- [Troubleshooting](#troubleshooting)

## Overview

This testing suite provides:

- **Integration Tests**: Test individual components and their interactions
- **End-to-End Tests**: Complete workflow testing from camera discovery to video streaming
- **Performance Tests**: Load testing, stress testing, and resource monitoring
- **Mock Services**: Simulated Axis cameras and cloud orchestrator
- **Load Testing**: High-volume concurrent user simulation

## Architecture

```
e2e-tests/
├── src/
│   └── test-utils.ts          # Core testing utilities
├── tests/
│   ├── integration/           # Integration test suites
│   ├── e2e/                  # End-to-end scenarios
│   └── setup.js              # Global test configuration
├── mocks/
│   ├── axis-camera-server.js  # Mock Axis camera
│   └── cloud-orchestrator.js # Mock cloud orchestrator
├── performance/
│   └── stress-test.js         # Performance and stress tests
├── load/
│   ├── scenarios.yml          # Artillery load test scenarios
│   └── websocket-load.js      # WebSocket load testing
└── docs/
    └── README.md              # This documentation
```

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Available ports: 3000, 3001, 8080, 8081

### Installation

```bash
# Clone and navigate to test directory
cd e2e-tests

# Install dependencies
npm install

# Run all tests
npm test

# Run specific test suites
npm run test:integration
npm run test:e2e
npm run test:performance
```

### Basic Usage

```bash
# Start mock services
npm run mock:all

# Run integration tests in another terminal
npm run test:integration

# Run load tests
npm run test:load
```

## Test Suites

### Integration Tests

#### Camera Discovery (`tests/integration/camera-discovery.test.js`)

Tests camera discovery and registration functionality:

- HTTP API discovery
- ONVIF discovery protocol
- Camera registration with orchestrator
- Camera capability detection
- Network parameter validation
- Error handling scenarios

```bash
# Run camera discovery tests
npx jest tests/integration/camera-discovery.test.js
```

#### WebSocket Connection (`tests/integration/websocket-connection.test.js`)

Tests WebSocket connectivity and messaging:

- Basic connection establishment
- Session-specific connections
- Message handling and routing
- Connection resilience
- Multiple concurrent connections
- Performance metrics

```bash
# Run WebSocket tests
npx jest tests/integration/websocket-connection.test.js
```

#### WebRTC Connection (`tests/integration/webrtc-connection.test.js`)

Tests WebRTC signaling and connection setup:

- Offer/Answer exchange
- ICE candidate handling
- SDP validation
- Session management
- Connection quality metrics
- Error recovery

```bash
# Run WebRTC tests
npx jest tests/integration/webrtc-connection.test.js
```

#### Video Streaming (`tests/integration/video-streaming.test.js`)

Tests video streaming capabilities:

- MJPEG streaming
- RTSP URL generation
- Stream configuration
- Multiple concurrent streams
- Performance measurement
- Stream error handling

```bash
# Run video streaming tests
npx jest tests/integration/video-streaming.test.js
```

#### PTZ Control (`tests/integration/ptz-control.test.js`)

Tests Pan-Tilt-Zoom control functionality:

- Absolute positioning
- Relative movements
- PTZ via orchestrator API
- WebSocket PTZ commands
- Performance measurement
- Command queuing

```bash
# Run PTZ control tests
npx jest tests/integration/ptz-control.test.js
```

### End-to-End Tests

#### Complete Workflow (`tests/e2e/complete-workflow.test.js`)

Full system integration scenarios:

- Complete camera onboarding workflow
- Full streaming session lifecycle
- Multi-client concurrent access
- System resilience testing
- Performance under load
- Security validation

```bash
# Run complete E2E tests
npx jest tests/e2e/complete-workflow.test.js
```

### Performance Tests

#### Stress Testing (`performance/stress-test.js`)

System performance under high load:

- High session creation rate
- Concurrent WebRTC negotiations
- WebSocket message throughput
- PTZ command performance
- Memory usage monitoring
- Error recovery performance

```bash
# Run performance tests
npx jest performance/stress-test.js
```

## Mock Services

### Mock Axis Camera Server

Simulates an Axis network camera with full API support:

- **HTTP API**: Device info, parameters, PTZ control
- **ONVIF Discovery**: WS-Discovery protocol support
- **Video Streaming**: MJPEG and RTSP simulation
- **WebRTC**: Direct camera WebRTC support
- **Event Streaming**: Motion detection and alerts
- **WebSocket**: Real-time camera communication

#### Usage

```javascript
const MockAxisCameraServer = require('./mocks/axis-camera-server');

const camera = new MockAxisCameraServer({
  port: 8080,
  wsPort: 8081,
  cameraId: 'ACCC8EF85A3C',
  model: 'AXIS P3245-V'
});

await camera.start();
```

#### API Endpoints

- `GET /axis-cgi/basicdeviceinfo.cgi` - Device information
- `GET /axis-cgi/param.cgi` - Parameter management
- `GET /axis-cgi/com/ptz.cgi` - PTZ control
- `GET /axis-cgi/mjpg/video.cgi` - MJPEG video stream
- `GET /axis-cgi/rtspurl.cgi` - RTSP URL generation
- `POST /webrtc/offer` - WebRTC signaling
- `WebSocket :8081` - Real-time communication

### Mock Cloud Orchestrator

Simulates the cloud orchestration service:

- **Camera Management**: Registration and discovery
- **Session Management**: WebRTC session handling
- **WebSocket Proxy**: Real-time communication
- **PTZ Orchestration**: Camera control coordination
- **Statistics**: Performance monitoring

#### Usage

```javascript
const MockCloudOrchestrator = require('./mocks/cloud-orchestrator');

const orchestrator = new MockCloudOrchestrator({
  port: 3000,
  wsPort: 3001
});

await orchestrator.start();
```

#### API Endpoints

- `POST /api/cameras/register` - Camera registration
- `GET /api/cameras` - Camera listing
- `POST /api/sessions` - Session creation
- `POST /api/sessions/:id/offer` - WebRTC offers
- `POST /api/cameras/:id/ptz` - PTZ control
- `WebSocket :3001` - Real-time communication

## Performance Testing

### Artillery Load Testing

HTTP API load testing using Artillery:

```bash
# Run Artillery load tests
npm run test:load

# Custom load test configuration
artillery run load/scenarios.yml --target http://localhost:3000
```

#### Load Test Scenarios

1. **Camera Registration Flow** (30% weight)
   - Register new cameras
   - Verify registration
   - Query camera details

2. **Session Management** (40% weight)
   - Create sessions
   - WebRTC negotiation
   - ICE candidate exchange

3. **PTZ Control** (20% weight)
   - Absolute positioning
   - Relative movements
   - Rapid command sequences

4. **Health Checks** (10% weight)
   - System status monitoring
   - Service health verification

### WebSocket Load Testing

Custom WebSocket load testing:

```bash
# Run WebSocket load tests
node load/websocket-load.js

# With custom parameters
CONNECTIONS=50 DURATION=120000 node load/websocket-load.js
```

#### Configuration Options

- `CONNECTIONS`: Number of concurrent WebSocket connections
- `DURATION`: Test duration in milliseconds
- `MESSAGE_INTERVAL`: Interval between messages in milliseconds
- `WS_URL`: WebSocket server URL
- `HTTP_URL`: HTTP server URL for session creation

## Configuration

### Environment Variables

```bash
# Test configuration
TEST_TIMEOUT=60000                    # Test timeout in ms
CAMERA_PORT=8080                      # Mock camera HTTP port
CAMERA_WS_PORT=8081                   # Mock camera WebSocket port
ORCHESTRATOR_PORT=3000                # Mock orchestrator HTTP port
ORCHESTRATOR_WS_PORT=3001             # Mock orchestrator WebSocket port

# Performance test configuration
PERFORMANCE_SESSIONS=50               # Number of test sessions
PERFORMANCE_DURATION=60000            # Performance test duration
STRESS_CONNECTIONS=100                # Stress test connection count

# Load test configuration
LOAD_ARRIVAL_RATE=20                  # Artillery arrival rate
LOAD_DURATION=300                     # Load test duration
LOAD_TARGET_URL=http://localhost:3000 # Load test target
```

### Jest Configuration

The test suite uses Jest with custom configuration:

```javascript
// jest.config.js
module.exports = {
  testTimeout: 30000,              // 30 second timeout
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  collectCoverageFrom: ['src/**/*.{js,ts}'],
  moduleNameMapping: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@mocks/(.*)$': '<rootDir>/mocks/$1'
  }
};
```

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  e2e-tests:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        
    - name: Install dependencies
      run: |
        cd e2e-tests
        npm ci
        
    - name: Start mock services
      run: |
        cd e2e-tests
        npm run mock:all &
        sleep 5
        
    - name: Run integration tests
      run: |
        cd e2e-tests
        npm run test:integration
        
    - name: Run E2E tests
      run: |
        cd e2e-tests
        npm run test:e2e
        
    - name: Run performance tests
      run: |
        cd e2e-tests
        npm run test:performance
        
    - name: Upload test results
      uses: actions/upload-artifact@v3
      if: always()
      with:
        name: test-results
        path: e2e-tests/coverage/
```

### Docker Integration

```dockerfile
# Dockerfile for E2E testing
FROM node:18-alpine

WORKDIR /app
COPY e2e-tests/package*.json ./
RUN npm ci

COPY e2e-tests/ ./

EXPOSE 3000 3001 8080 8081

CMD ["npm", "test"]
```

## Troubleshooting

### Common Issues

#### Port Conflicts

```bash
# Check for port usage
lsof -i :3000
lsof -i :3001
lsof -i :8080
lsof -i :8081

# Kill processes using ports
kill -9 $(lsof -t -i:3000)
```

#### Mock Service Startup

```bash
# Verify mock services are running
curl http://localhost:3000/health
curl http://localhost:8080/health

# Check WebSocket connectivity
wscat -c ws://localhost:3001
wscat -c ws://localhost:8081
```

#### Memory Issues

```bash
# Run with increased memory
node --max-old-space-size=4096 --expose-gc performance/stress-test.js

# Monitor memory usage
node --max-old-space-size=4096 --trace-gc tests/e2e/complete-workflow.test.js
```

### Debugging

#### Enable Debug Logging

```bash
# Enable verbose logging
DEBUG=* npm test

# Enable specific debug categories
DEBUG=test:*,websocket:* npm test
```

#### Test Individual Components

```bash
# Test specific functionality
npx jest --testNamePattern="should discover camera"
npx jest --testPathPattern="websocket"
npx jest --testTimeout=120000 performance/
```

#### Performance Monitoring

```bash
# Run with performance monitoring
node --prof performance/stress-test.js
node --prof-process isolate-*.log > profile.txt

# Memory profiling
node --inspect performance/stress-test.js
```

### Test Data Cleanup

```bash
# Clean test artifacts
rm -rf coverage/
rm -rf node_modules/.cache/
rm -f *.log

# Reset mock state
curl -X POST http://localhost:3000/api/reset
curl -X POST http://localhost:8080/api/reset
```

## Best Practices

### Writing Tests

1. **Use descriptive test names** that explain what is being tested
2. **Clean up resources** in afterEach/afterAll hooks
3. **Use appropriate timeouts** for different types of tests
4. **Mock external dependencies** to ensure test isolation
5. **Test error conditions** in addition to happy paths

### Performance Testing

1. **Start with baseline measurements** before making changes
2. **Test under realistic load** that matches production usage
3. **Monitor system resources** during performance tests
4. **Use gradual load increases** to identify breaking points
5. **Document performance expectations** and acceptance criteria

### Debugging Failures

1. **Check logs** from both mock services and test output
2. **Verify network connectivity** between components
3. **Test components individually** before testing integration
4. **Use debugging tools** like Chrome DevTools for WebSocket inspection
5. **Reproduce issues** with minimal test cases

## Contributing

When adding new tests:

1. Follow the existing test structure and naming conventions
2. Add appropriate documentation and comments
3. Include both positive and negative test cases
4. Update this README with any new features or requirements
5. Ensure tests are deterministic and don't rely on external services

## License

This testing suite is part of the Anava Vision project and follows the same licensing terms.