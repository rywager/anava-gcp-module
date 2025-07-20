const { TestHelper } = require('../../src/test-utils');
const MockAxisCameraServer = require('../../mocks/axis-camera-server');
const MockCloudOrchestrator = require('../../mocks/cloud-orchestrator');
const WebSocket = require('ws');

describe('Complete E2E Workflow Tests', () => {
  let cameraServer;
  let orchestrator;
  let testHelper;

  const CAMERA_CONFIG = {
    id: 'ACCC8EF85A3C',
    ip: 'localhost',
    port: 8080,
    model: 'AXIS P3245-V'
  };

  const ORCHESTRATOR_CONFIG = {
    baseUrl: 'http://localhost:3000',
    wsUrl: 'ws://localhost:3001'
  };

  beforeAll(async () => {
    // Start mock servers
    cameraServer = new MockAxisCameraServer({
      port: CAMERA_CONFIG.port,
      wsPort: 8081,
      cameraId: CAMERA_CONFIG.id,
      model: CAMERA_CONFIG.model
    });

    orchestrator = new MockCloudOrchestrator({
      port: 3000,
      wsPort: 3001
    });

    await cameraServer.start();
    await orchestrator.start();

    // Initialize test helper
    testHelper = new TestHelper(CAMERA_CONFIG, ORCHESTRATOR_CONFIG);

    // Wait for servers to be ready
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    if (testHelper) {
      await testHelper.cleanup();
    }
    if (cameraServer) {
      await cameraServer.stop();
    }
    if (orchestrator) {
      await orchestrator.stop();
    }
  });

  describe('Complete System Integration', () => {
    test('should complete full camera onboarding workflow', async () => {
      // Step 1: Discover camera
      console.log('Step 1: Discovering camera...');
      const discovered = await testHelper.discoverCamera();
      expect(discovered).toBe(true);

      // Step 2: Test ONVIF discovery
      console.log('Step 2: Testing ONVIF discovery...');
      const onvifDiscovered = await testHelper.testOnvifDiscovery();
      expect(onvifDiscovered).toBe(true);

      // Step 3: Register camera with orchestrator
      console.log('Step 3: Registering camera with orchestrator...');
      const registered = await testHelper.registerCamera();
      expect(registered).toBe(true);

      // Step 4: Verify camera appears in camera list
      console.log('Step 4: Verifying camera registration...');
      const axios = require('axios');
      const cameraListResponse = await axios.get(`${ORCHESTRATOR_CONFIG.baseUrl}/api/cameras`);
      expect(cameraListResponse.status).toBe(200);
      
      const camera = cameraListResponse.data.cameras.find(c => c.id === CAMERA_CONFIG.id);
      expect(camera).toBeDefined();
      expect(camera.status).toBe('online');

      console.log('✓ Camera onboarding completed successfully');
    });

    test('should complete full streaming session workflow', async () => {
      // Step 1: Create streaming session
      console.log('Step 1: Creating streaming session...');
      const session = await testHelper.createSession(CAMERA_CONFIG.id, 'live');
      expect(session).toBeDefined();
      expect(session.id).toBeDefined();

      // Step 2: Connect to session WebSocket
      console.log('Step 2: Connecting to session WebSocket...');
      const ws = await testHelper.connectWebSocket(session.id);
      expect(ws.readyState).toBe(WebSocket.OPEN);

      // Wait for welcome message
      const welcomeData = await testHelper.waitForEvent('ws_message', 3000);
      expect(welcomeData.message.type).toBe('connected');

      // Step 3: Setup WebRTC connection
      console.log('Step 3: Setting up WebRTC connection...');
      const answer = await testHelper.testWebRTCOffer(session.id);
      expect(answer).toBeDefined();
      expect(answer.type).toBe('answer');

      // Step 4: Exchange ICE candidates
      console.log('Step 4: Exchanging ICE candidates...');
      const candidateResult = await testHelper.testIceCandidate(session.id);
      expect(candidateResult).toBe(true);

      // Step 5: Start video streaming
      console.log('Step 5: Starting video stream...');
      testHelper.sendMessage(session.id, {
        type: 'stream_control',
        payload: { action: 'start' }
      });

      // Wait for stream to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 6: Verify session is active
      console.log('Step 6: Verifying session status...');
      const sessionData = await testHelper.getSession(session.id);
      expect(['active', 'streaming']).toContain(sessionData.status);

      ws.close();
      console.log('✓ Streaming session workflow completed successfully');
    });

    test('should complete full PTZ control workflow', async () => {
      // Step 1: Create session
      const session = await testHelper.createSession(CAMERA_CONFIG.id);
      const ws = await testHelper.connectWebSocket(session.id);

      // Step 2: Test direct PTZ control
      console.log('Step 1: Testing direct PTZ control...');
      const directPtzResult = await testHelper.testDirectPTZ(45, 30, 2);
      expect(directPtzResult).toBe(true);

      // Step 3: Test PTZ via orchestrator API
      console.log('Step 2: Testing PTZ via orchestrator...');
      const orchestratorPtzResult = await testHelper.testPTZControl(
        CAMERA_CONFIG.id,
        'absolute',
        { pan: -45, tilt: -30, zoom: 1.5 }
      );
      expect(orchestratorPtzResult).toBe(true);

      // Step 4: Test PTZ via WebSocket
      console.log('Step 3: Testing PTZ via WebSocket...');
      testHelper.sendMessage(session.id, {
        type: 'ptz_command',
        payload: {
          command: 'absolute',
          params: { pan: 0, tilt: 0, zoom: 1 }
        }
      });

      // Step 5: Verify PTZ position
      console.log('Step 4: Verifying PTZ position...');
      const axios = require('axios');
      const positionResponse = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/com/ptz.cgi`,
        { params: { query: 'position' } }
      );
      expect(positionResponse.data).toContain('pan=0');
      expect(positionResponse.data).toContain('tilt=0');
      expect(positionResponse.data).toContain('zoom=1');

      ws.close();
      console.log('✓ PTZ control workflow completed successfully');
    });

    test('should handle multi-client concurrent access', async () => {
      console.log('Testing multi-client concurrent access...');

      // Create multiple sessions
      const sessionCount = 3;
      const sessions = [];
      const websockets = [];

      // Step 1: Create multiple sessions
      for (let i = 0; i < sessionCount; i++) {
        console.log(`Creating session ${i + 1}/${sessionCount}...`);
        const session = await testHelper.createSession(CAMERA_CONFIG.id, 'live');
        sessions.push(session);

        const ws = await testHelper.connectWebSocket(session.id);
        websockets.push(ws);
      }

      // Step 2: Setup WebRTC for all sessions
      console.log('Setting up WebRTC for all sessions...');
      const webrtcPromises = sessions.map(session => 
        testHelper.testWebRTCOffer(session.id)
      );
      const answers = await Promise.all(webrtcPromises);
      
      answers.forEach(answer => {
        expect(answer).toBeDefined();
        expect(answer.type).toBe('answer');
      });

      // Step 3: Start streaming on all sessions
      console.log('Starting streams on all sessions...');
      sessions.forEach((session, index) => {
        testHelper.sendMessage(session.id, {
          type: 'stream_control',
          payload: { action: 'start' }
        });
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Step 4: Perform PTZ from different sessions
      console.log('Testing PTZ from multiple sessions...');
      const ptzCommands = [
        { pan: 30, tilt: 15, zoom: 1.5 },
        { pan: -30, tilt: 15, zoom: 2 },
        { pan: 0, tilt: 0, zoom: 1 }
      ];

      for (let i = 0; i < Math.min(sessionCount, ptzCommands.length); i++) {
        testHelper.sendMessage(sessions[i].id, {
          type: 'ptz_command',
          payload: {
            command: 'absolute',
            params: ptzCommands[i]
          }
        });
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Step 5: Cleanup
      websockets.forEach(ws => ws.close());
      
      console.log('✓ Multi-client concurrent access completed successfully');
    });
  });

  describe('System Resilience and Recovery', () => {
    test('should recover from camera disconnection', async () => {
      console.log('Testing camera disconnection recovery...');

      // Step 1: Establish normal operation
      const session = await testHelper.createSession(CAMERA_CONFIG.id);
      const ws = await testHelper.connectWebSocket(session.id);
      await testHelper.testWebRTCOffer(session.id);

      // Step 2: Simulate camera disconnection
      console.log('Simulating camera disconnection...');
      await cameraServer.stop();

      // Step 3: Wait for disconnection detection
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Step 4: Restart camera
      console.log('Restarting camera...');
      cameraServer = new MockAxisCameraServer({
        port: CAMERA_CONFIG.port,
        wsPort: 8081,
        cameraId: CAMERA_CONFIG.id,
        model: CAMERA_CONFIG.model
      });
      await cameraServer.start();

      // Step 5: Verify recovery
      console.log('Verifying recovery...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const recovered = await testHelper.discoverCamera();
      expect(recovered).toBe(true);

      ws.close();
      console.log('✓ Camera disconnection recovery completed');
    });

    test('should handle orchestrator service restart', async () => {
      console.log('Testing orchestrator service restart...');

      // Step 1: Register camera
      await testHelper.registerCamera();

      // Step 2: Stop orchestrator
      console.log('Stopping orchestrator...');
      await orchestrator.stop();

      // Step 3: Restart orchestrator
      console.log('Restarting orchestrator...');
      orchestrator = new MockCloudOrchestrator({
        port: 3000,
        wsPort: 3001
      });
      await orchestrator.start();

      // Step 4: Re-register camera
      console.log('Re-registering camera...');
      const registered = await testHelper.registerCamera();
      expect(registered).toBe(true);

      // Step 5: Verify functionality
      const session = await testHelper.createSession(CAMERA_CONFIG.id);
      expect(session).toBeDefined();

      console.log('✓ Orchestrator restart recovery completed');
    });

    test('should handle network interruptions gracefully', async () => {
      console.log('Testing network interruption handling...');

      // Step 1: Establish connections
      const session = await testHelper.createSession(CAMERA_CONFIG.id);
      const ws = await testHelper.connectWebSocket(session.id);

      // Step 2: Simulate network issues with timeouts
      const axios = require('axios');
      let networkErrors = 0;

      for (let i = 0; i < 5; i++) {
        try {
          await axios.get(
            `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/health`,
            { timeout: 100 } // Very short timeout to simulate network issues
          );
        } catch (error) {
          networkErrors++;
        }
      }

      // Step 3: Verify system continues to work with normal timeouts
      const healthCheck = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/health`,
        { timeout: 5000 }
      );
      expect(healthCheck.status).toBe(200);

      ws.close();
      console.log(`✓ Network interruption handling completed (${networkErrors} simulated errors)`);
    });
  });

  describe('Performance and Load Testing', () => {
    test('should handle rapid session creation and destruction', async () => {
      console.log('Testing rapid session lifecycle...');

      const sessionCount = 10;
      const sessionPromises = [];

      // Create sessions rapidly
      for (let i = 0; i < sessionCount; i++) {
        sessionPromises.push(testHelper.createSession(CAMERA_CONFIG.id, 'live'));
      }

      const sessions = await Promise.all(sessionPromises);
      
      // All sessions should be created successfully
      sessions.forEach(session => {
        expect(session).toBeDefined();
        expect(session.id).toBeDefined();
      });

      console.log(`✓ Created ${sessions.length} sessions rapidly`);

      // Test session retrieval
      const sessionDataPromises = sessions.map(session => 
        testHelper.getSession(session.id)
      );
      const sessionData = await Promise.all(sessionDataPromises);

      sessionData.forEach(data => {
        expect(data).toBeDefined();
        expect(data.status).toBeDefined();
      });

      console.log('✓ Rapid session lifecycle completed');
    });

    test('should measure end-to-end latency', async () => {
      console.log('Measuring end-to-end latency...');

      const latencyMeasurements = [];
      const iterations = 5;

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();

        // Full workflow: discover -> register -> create session -> WebRTC
        await testHelper.discoverCamera();
        await testHelper.registerCamera();
        const session = await testHelper.createSession(CAMERA_CONFIG.id);
        await testHelper.testWebRTCOffer(session.id);

        const totalLatency = Date.now() - start;
        latencyMeasurements.push(totalLatency);

        console.log(`Iteration ${i + 1}: ${totalLatency}ms`);
      }

      const avgLatency = latencyMeasurements.reduce((sum, l) => sum + l, 0) / latencyMeasurements.length;
      const maxLatency = Math.max(...latencyMeasurements);
      const minLatency = Math.min(...latencyMeasurements);

      console.log(`Average latency: ${avgLatency.toFixed(2)}ms`);
      console.log(`Min latency: ${minLatency}ms`);
      console.log(`Max latency: ${maxLatency}ms`);

      expect(avgLatency).toBeLessThan(5000); // Should be less than 5 seconds
      expect(maxLatency).toBeLessThan(10000); // Max should be less than 10 seconds

      console.log('✓ End-to-end latency measurement completed');
    });

    test('should measure system throughput', async () => {
      console.log('Measuring system throughput...');

      const throughputResult = await testHelper.testThroughput(5000); // 5 second test
      console.log(`System throughput: ${throughputResult.toFixed(2)} requests/second`);

      expect(throughputResult).toBeGreaterThan(10); // Should handle at least 10 req/sec

      console.log('✓ System throughput measurement completed');
    });
  });

  describe('Security and Authentication', () => {
    test('should handle authentication scenarios', async () => {
      console.log('Testing authentication scenarios...');

      // Test with credentials (mock scenario)
      const authTestHelper = new TestHelper(
        { ...CAMERA_CONFIG, username: 'admin', password: 'password123' },
        ORCHESTRATOR_CONFIG
      );

      // Should still work with authentication
      const discovered = await authTestHelper.discoverCamera();
      expect(discovered).toBe(true);

      await authTestHelper.cleanup();

      console.log('✓ Authentication scenarios completed');
    });

    test('should validate session security', async () => {
      console.log('Testing session security...');

      // Create a session
      const session = await testHelper.createSession(CAMERA_CONFIG.id);
      
      // Session should have proper security context
      expect(session.id).toMatch(/^[a-f0-9\-]{36}$/); // UUID format
      expect(session.webrtc).toBeDefined();
      expect(session.cameraId).toBe(CAMERA_CONFIG.id);

      // Session should be retrievable only with correct ID
      const sessionData = await testHelper.getSession(session.id);
      expect(sessionData.id).toBe(session.id);

      console.log('✓ Session security validation completed');
    });
  });

  describe('Integration Edge Cases', () => {
    test('should handle edge case scenarios', async () => {
      console.log('Testing edge case scenarios...');

      // Edge case 1: Rapid connect/disconnect
      for (let i = 0; i < 3; i++) {
        const ws = await testHelper.connectWebSocket();
        ws.close();
      }

      // Edge case 2: Invalid session operations
      try {
        await testHelper.getSession('invalid-session-id');
      } catch (error) {
        // Expected to fail
      }

      // Edge case 3: Concurrent PTZ commands
      const ptzPromises = [];
      for (let i = 0; i < 5; i++) {
        ptzPromises.push(
          testHelper.testDirectPTZ(
            Math.random() * 180 - 90,
            Math.random() * 90 - 45,
            Math.random() * 2 + 1
          ).catch(() => false)
        );
      }

      const ptzResults = await Promise.all(ptzPromises);
      const successCount = ptzResults.filter(r => r === true).length;
      expect(successCount).toBeGreaterThan(0);

      console.log('✓ Edge case scenarios completed');
    });

    test('should maintain data consistency', async () => {
      console.log('Testing data consistency...');

      // Create session
      const session = await testHelper.createSession(CAMERA_CONFIG.id);
      
      // Perform operations that could affect consistency
      await testHelper.testWebRTCOffer(session.id);
      await testHelper.testPTZControl(CAMERA_CONFIG.id, 'absolute', { pan: 45, tilt: 30, zoom: 2 });

      // Verify session state is consistent
      const sessionData = await testHelper.getSession(session.id);
      expect(sessionData.id).toBe(session.id);
      expect(sessionData.cameraId).toBe(CAMERA_CONFIG.id);
      expect(sessionData.webrtc).toBeDefined();

      console.log('✓ Data consistency verified');
    });
  });
});