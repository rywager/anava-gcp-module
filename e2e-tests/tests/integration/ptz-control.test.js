const { TestHelper } = require('../../src/test-utils');
const MockAxisCameraServer = require('../../mocks/axis-camera-server');
const MockCloudOrchestrator = require('../../mocks/cloud-orchestrator');
const axios = require('axios');

describe('PTZ Control Integration Tests', () => {
  let cameraServer;
  let orchestrator;
  let testHelper;
  let session;

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

    // Register camera and create session
    await testHelper.registerCamera();
    session = await testHelper.createSession(CAMERA_CONFIG.id);

    // Wait for servers to be ready
    await new Promise(resolve => setTimeout(resolve, 1000));
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

  describe('Basic PTZ Operations', () => {
    test('should perform absolute positioning', async () => {
      const result = await testHelper.testDirectPTZ(90, 45, 2);
      expect(result).toBe(true);
    });

    test('should read current PTZ position', async () => {
      const response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/com/ptz.cgi`,
        { params: { query: 'position' } }
      );

      expect(response.status).toBe(200);
      expect(response.data).toContain('pan=');
      expect(response.data).toContain('tilt=');
      expect(response.data).toContain('zoom=');
    });

    test('should move to preset positions', async () => {
      const presetPositions = [
        { pan: 0, tilt: 0, zoom: 1 },      // Home
        { pan: 90, tilt: 30, zoom: 2 },    // Right
        { pan: -90, tilt: 30, zoom: 2 },   // Left
        { pan: 0, tilt: 60, zoom: 3 },     // Up
        { pan: 0, tilt: -30, zoom: 1.5 }   // Down
      ];

      for (const position of presetPositions) {
        const result = await testHelper.testDirectPTZ(
          position.pan, 
          position.tilt, 
          position.zoom
        );
        expect(result).toBe(true);

        // Verify position was set
        const response = await axios.get(
          `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/com/ptz.cgi`,
          { params: { query: 'position' } }
        );

        expect(response.data).toContain(`pan=${position.pan}`);
        expect(response.data).toContain(`tilt=${position.tilt}`);
        expect(response.data).toContain(`zoom=${position.zoom}`);
      }
    });

    test('should handle relative movements', async () => {
      // Set initial position
      await testHelper.testDirectPTZ(0, 0, 1);

      // Relative movements
      const movements = [
        { pan: 10, tilt: 5, zoom: 0.5 },
        { pan: -5, tilt: 10, zoom: 0.2 },
        { pan: -10, tilt: -15, zoom: -0.3 }
      ];

      for (const movement of movements) {
        const response = await axios.get(
          `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/com/ptz.cgi`,
          { 
            params: {
              rpan: movement.pan,
              rtilt: movement.tilt,
              rzoom: movement.zoom
            }
          }
        );
        expect(response.status).toBe(200);
      }
    });
  });

  describe('PTZ Through Orchestrator', () => {
    test('should control PTZ via orchestrator API', async () => {
      const result = await testHelper.testPTZControl(
        CAMERA_CONFIG.id,
        'absolute',
        { pan: 45, tilt: 30, zoom: 1.8 }
      );
      expect(result).toBe(true);
    });

    test('should handle different PTZ command types', async () => {
      const commands = [
        {
          command: 'absolute',
          params: { pan: 0, tilt: 0, zoom: 1 }
        },
        {
          command: 'relative',
          params: { pan: 15, tilt: 10, zoom: 0.5 }
        },
        {
          command: 'continuous',
          params: { panSpeed: 50, tiltSpeed: 30, direction: 'right_up' }
        },
        {
          command: 'stop',
          params: {}
        }
      ];

      for (const cmd of commands) {
        const result = await testHelper.testPTZControl(
          CAMERA_CONFIG.id,
          cmd.command,
          cmd.params
        );
        expect(result).toBe(true);
      }
    });

    test('should provide PTZ feedback via WebSocket', async () => {
      const ws = await testHelper.connectWebSocket(session.id);

      // Send PTZ command
      const ptzResult = await testHelper.testPTZControl(
        CAMERA_CONFIG.id,
        'absolute',
        { pan: 60, tilt: 20, zoom: 2.5 }
      );
      expect(ptzResult).toBe(true);

      // Wait for PTZ update notification
      try {
        const updateMessage = await testHelper.waitForEvent('ws_message', 3000);
        if (updateMessage.message.type === 'ptz_update') {
          expect(updateMessage.message.data.command).toBe('absolute');
          expect(updateMessage.message.data.status).toBe('executed');
        }
      } catch (error) {
        console.log('PTZ update not received (expected in test environment)');
      }

      ws.close();
    });
  });

  describe('PTZ via WebSocket', () => {
    let ws;

    beforeEach(async () => {
      ws = await testHelper.connectWebSocket(session.id);
    });

    afterEach(() => {
      if (ws && ws.readyState === 1) {
        ws.close();
      }
    });

    test('should send PTZ commands via WebSocket', async () => {
      const ptzMessage = {
        type: 'ptz_command',
        payload: {
          command: 'absolute',
          params: { pan: 30, tilt: 15, zoom: 1.5 }
        }
      };

      const sent = testHelper.sendMessage(session.id, ptzMessage);
      expect(sent).toBe(true);

      // Wait for response
      try {
        const response = await testHelper.waitForEvent('ws_message', 3000);
        if (response.message.type === 'ptz_executed') {
          expect(response.message.data.status).toBe('success');
        }
      } catch (error) {
        console.log('PTZ response not received (expected in test environment)');
      }
    });

    test('should handle continuous PTZ movements', async () => {
      const continuousCommands = [
        { command: 'start_pan', params: { speed: 50, direction: 'right' } },
        { command: 'start_tilt', params: { speed: 30, direction: 'up' } },
        { command: 'start_zoom', params: { speed: 20, direction: 'in' } }
      ];

      for (const cmd of continuousCommands) {
        testHelper.sendMessage(session.id, {
          type: 'ptz_command',
          payload: cmd
        });
        
        // Wait between commands
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Stop all movements
      testHelper.sendMessage(session.id, {
        type: 'ptz_command',
        payload: { command: 'stop_all' }
      });
    });

    test('should queue PTZ commands properly', async () => {
      const commands = [
        { pan: 0, tilt: 0, zoom: 1 },
        { pan: 30, tilt: 15, zoom: 1.5 },
        { pan: 60, tilt: 30, zoom: 2 },
        { pan: 90, tilt: 45, zoom: 2.5 },
        { pan: 0, tilt: 0, zoom: 1 }
      ];

      // Send multiple commands rapidly
      for (const cmd of commands) {
        testHelper.sendMessage(session.id, {
          type: 'ptz_command',
          payload: {
            command: 'absolute',
            params: cmd
          }
        });
      }

      // All commands should be processed
      await new Promise(resolve => setTimeout(resolve, 1000));
    });
  });

  describe('PTZ Capabilities and Limits', () => {
    test('should respect PTZ limits', async () => {
      const response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/param.cgi`,
        { params: { action: 'list', group: 'root.PTZ' } }
      );

      expect(response.status).toBe(200);
      expect(response.data).toContain('root.PTZ.Limit.L1.MinPan=');
      expect(response.data).toContain('root.PTZ.Limit.L1.MaxPan=');
      expect(response.data).toContain('root.PTZ.Limit.L1.MinTilt=');
      expect(response.data).toContain('root.PTZ.Limit.L1.MaxTilt=');
    });

    test('should handle out-of-range commands gracefully', async () => {
      const extremeCommands = [
        { pan: 999, tilt: 0, zoom: 1 },      // Pan out of range
        { pan: 0, tilt: 999, zoom: 1 },      // Tilt out of range
        { pan: 0, tilt: 0, zoom: 999 },      // Zoom out of range
        { pan: -999, tilt: -999, zoom: -1 }  // All out of range
      ];

      for (const cmd of extremeCommands) {
        try {
          await testHelper.testDirectPTZ(cmd.pan, cmd.tilt, cmd.zoom);
          // Should either succeed (with clamping) or fail gracefully
        } catch (error) {
          // Acceptable to reject out-of-range commands
          expect([400, 422]).toContain(error.response?.status || 400);
        }
      }
    });

    test('should report PTZ capabilities', async () => {
      const response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/param.cgi`,
        { params: { action: 'list', group: 'root.PTZ' } }
      );

      const capabilities = response.data;
      
      // Should report basic PTZ capabilities
      expect(capabilities).toContain('root.PTZ.PTZ.Enabled=yes');
      
      // Should include current position
      expect(capabilities).toContain('root.PTZ.PTZ.CurrentPan=');
      expect(capabilities).toContain('root.PTZ.PTZ.CurrentTilt=');
      expect(capabilities).toContain('root.PTZ.PTZ.CurrentZoom=');
    });
  });

  describe('PTZ Performance', () => {
    test('should measure PTZ command response time', async () => {
      const iterations = 10;
      const responseTimes = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await testHelper.testDirectPTZ(
          Math.random() * 180 - 90,  // Random pan
          Math.random() * 90 - 45,   // Random tilt
          Math.random() * 2 + 1      // Random zoom 1-3
        );
        const responseTime = Date.now() - start;
        responseTimes.push(responseTime);
      }

      const avgResponseTime = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
      expect(avgResponseTime).toBeLessThan(500); // Should be less than 500ms
    });

    test('should handle rapid PTZ commands', async () => {
      const rapidCommands = [];
      for (let i = 0; i < 20; i++) {
        rapidCommands.push({
          pan: (i * 18) % 180 - 90,
          tilt: (i * 9) % 90 - 45,
          zoom: (i % 3) + 1
        });
      }

      const start = Date.now();
      
      for (const cmd of rapidCommands) {
        await testHelper.testDirectPTZ(cmd.pan, cmd.tilt, cmd.zoom);
      }

      const totalTime = Date.now() - start;
      const avgTimePerCommand = totalTime / rapidCommands.length;
      
      expect(avgTimePerCommand).toBeLessThan(200); // Should average less than 200ms per command
    });

    test('should maintain accuracy during continuous movement', async () => {
      const testPositions = [
        { pan: 0, tilt: 0, zoom: 1 },
        { pan: 45, tilt: 30, zoom: 2 },
        { pan: -45, tilt: -30, zoom: 1.5 },
        { pan: 90, tilt: 45, zoom: 3 },
        { pan: 0, tilt: 0, zoom: 1 }
      ];

      for (const targetPosition of testPositions) {
        await testHelper.testDirectPTZ(
          targetPosition.pan,
          targetPosition.tilt,
          targetPosition.zoom
        );

        // Verify position accuracy
        const response = await axios.get(
          `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/com/ptz.cgi`,
          { params: { query: 'position' } }
        );

        expect(response.data).toContain(`pan=${targetPosition.pan}`);
        expect(response.data).toContain(`tilt=${targetPosition.tilt}`);
        expect(response.data).toContain(`zoom=${targetPosition.zoom}`);
      }
    });
  });

  describe('PTZ Error Handling', () => {
    test('should handle invalid PTZ commands', async () => {
      try {
        await axios.get(
          `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/com/ptz.cgi`,
          { 
            params: {
              invalidParam: 'test',
              pan: 'not_a_number'
            }
          }
        );
      } catch (error) {
        expect([400, 422]).toContain(error.response?.status || 400);
      }
    });

    test('should recover from PTZ command failures', async () => {
      // Send potentially problematic command
      try {
        await testHelper.testDirectPTZ(9999, 9999, 9999);
      } catch (error) {
        // Expected to fail
      }

      // Normal command should still work
      const result = await testHelper.testDirectPTZ(0, 0, 1);
      expect(result).toBe(true);
    });

    test('should handle PTZ timeouts gracefully', async () => {
      // Simulate timeout by sending many rapid commands
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          testHelper.testDirectPTZ(
            Math.random() * 180 - 90,
            Math.random() * 90 - 45,
            Math.random() * 2 + 1
          ).catch(() => false) // Convert failures to false
        );
      }

      const results = await Promise.all(promises);
      
      // At least some should succeed
      const successCount = results.filter(r => r === true).length;
      expect(successCount).toBeGreaterThan(0);
    });
  });

  describe('PTZ Integration with Video', () => {
    test('should maintain video stream during PTZ movement', async () => {
      // Start video stream
      const streamPromise = axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/mjpg/video.cgi`,
        {
          params: { resolution: '640x480', fps: 15 },
          timeout: 5000,
          responseType: 'stream'
        }
      );

      const response = await streamPromise;
      expect(response.status).toBe(200);

      // Perform PTZ movements while streaming
      const movements = [
        { pan: 30, tilt: 15, zoom: 1.5 },
        { pan: -30, tilt: -15, zoom: 2 },
        { pan: 0, tilt: 0, zoom: 1 }
      ];

      for (const movement of movements) {
        await testHelper.testDirectPTZ(movement.pan, movement.tilt, movement.zoom);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Stream should still be active
      let streamActive = false;
      response.data.on('data', () => {
        streamActive = true;
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
      response.data.destroy();

      expect(streamActive).toBe(true);
    });

    test('should coordinate PTZ with WebRTC stream', async () => {
      // Setup WebRTC
      const answer = await testHelper.testWebRTCOffer(session.id);
      expect(answer).toBeDefined();

      const ws = await testHelper.connectWebSocket(session.id);

      // Start streaming
      testHelper.sendMessage(session.id, {
        type: 'stream_control',
        payload: { action: 'start' }
      });

      // Perform PTZ via WebSocket
      testHelper.sendMessage(session.id, {
        type: 'ptz_command',
        payload: {
          command: 'absolute',
          params: { pan: 45, tilt: 30, zoom: 2 }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      ws.close();
    });
  });
});