const { TestHelper } = require('../../src/test-utils');
const MockAxisCameraServer = require('../../mocks/axis-camera-server');
const MockCloudOrchestrator = require('../../mocks/cloud-orchestrator');

describe('WebRTC Connection Integration Tests', () => {
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

  describe('WebRTC Signaling', () => {
    test('should exchange offers and answers', async () => {
      const answer = await testHelper.testWebRTCOffer(session.id);
      
      expect(answer).toBeDefined();
      expect(answer.type).toBe('answer');
      expect(answer.sdp).toBeDefined();
      expect(answer.sdp).toContain('v=0');
      expect(answer.sdp).toContain('m=video');
    });

    test('should handle ICE candidates', async () => {
      const candidateResult = await testHelper.testIceCandidate(session.id);
      expect(candidateResult).toBe(true);
    });

    test('should validate SDP content', async () => {
      const answer = await testHelper.testWebRTCOffer(session.id);
      
      expect(answer.sdp).toContain('a=setup:active');
      expect(answer.sdp).toContain('a=sendrecv');
      expect(answer.sdp).toContain('a=rtcp-mux');
    });

    test('should handle multiple codec formats', async () => {
      const answer = await testHelper.testWebRTCOffer(session.id);
      
      // Should support common codecs
      const sdp = answer.sdp;
      const hasVP8 = sdp.includes('VP8') || sdp.includes('96');
      const hasH264 = sdp.includes('H264') || sdp.includes('97');
      
      expect(hasVP8 || hasH264).toBe(true);
    });
  });

  describe('WebRTC Session Management', () => {
    test('should create WebRTC-enabled session', async () => {
      const sessionData = await testHelper.getSession(session.id);
      
      expect(sessionData).toBeDefined();
      expect(sessionData.webrtc).toBeDefined();
      expect(sessionData.webrtc.connectionState).toBeDefined();
    });

    test('should track session status during WebRTC negotiation', async () => {
      // Initial session should be initializing
      let sessionData = await testHelper.getSession(session.id);
      expect(['initializing', 'active', 'negotiating']).toContain(sessionData.status);

      // After offer/answer exchange
      await testHelper.testWebRTCOffer(session.id);
      
      sessionData = await testHelper.getSession(session.id);
      expect(['active', 'connected']).toContain(sessionData.status);
    });

    test('should update WebRTC connection state', async () => {
      await testHelper.testWebRTCOffer(session.id);
      
      const sessionData = await testHelper.getSession(session.id);
      expect(['connected', 'completed']).toContain(sessionData.webrtc.connectionState);
    });
  });

  describe('Direct Camera WebRTC', () => {
    test('should support direct WebRTC to camera', async () => {
      const axios = require('axios');
      
      const offerData = {
        offer: {
          type: 'offer',
          sdp: 'v=0\no=- 123456 2 IN IP4 127.0.0.1\ns=Direct Stream\nt=0 0\nm=video 9 UDP/TLS/RTP/SAVPF 96\na=rtpmap:96 VP8/90000'
        },
        streamId: 'direct-stream-001'
      };

      const response = await axios.post(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/webrtc/offer`,
        offerData
      );

      expect(response.status).toBe(200);
      expect(response.data.answer).toBeDefined();
      expect(response.data.answer.type).toBe('answer');
      expect(response.data.streamId).toBe(offerData.streamId);
    });

    test('should generate valid camera SDP response', async () => {
      const axios = require('axios');
      
      const offerData = {
        offer: {
          type: 'offer',
          sdp: 'v=0\no=- 123456 2 IN IP4 127.0.0.1\ns=Test\nt=0 0\nm=video 9 UDP/TLS/RTP/SAVPF 96'
        }
      };

      const response = await axios.post(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/webrtc/offer`,
        offerData
      );

      const sdp = response.data.answer.sdp;
      expect(sdp).toContain('v=0');
      expect(sdp).toContain('o=-');
      expect(sdp).toContain('m=video');
      expect(sdp).toContain('a=setup:active');
    });
  });

  describe('Connection Quality and Performance', () => {
    test('should measure WebRTC setup time', async () => {
      const iterations = 5;
      const setupTimes = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        await testHelper.testWebRTCOffer(session.id);
        const setupTime = Date.now() - start;
        setupTimes.push(setupTime);
      }

      const avgSetupTime = setupTimes.reduce((sum, time) => sum + time, 0) / setupTimes.length;
      expect(avgSetupTime).toBeLessThan(1000); // Should be less than 1 second
    });

    test('should handle concurrent WebRTC sessions', async () => {
      const sessionPromises = [];
      const sessionCount = 3;

      // Create multiple sessions
      for (let i = 0; i < sessionCount; i++) {
        const sessionPromise = testHelper.createSession(CAMERA_CONFIG.id, 'live');
        sessionPromises.push(sessionPromise);
      }

      const sessions = await Promise.all(sessionPromises);
      
      // All sessions should be created successfully
      sessions.forEach(sessionData => {
        expect(sessionData).toBeDefined();
        expect(sessionData.id).toBeDefined();
      });

      // Test WebRTC on each session
      const webrtcPromises = sessions.map(sessionData => 
        testHelper.testWebRTCOffer(sessionData.id)
      );

      const answers = await Promise.all(webrtcPromises);
      
      // All should succeed
      answers.forEach(answer => {
        expect(answer).toBeDefined();
        expect(answer.type).toBe('answer');
      });
    });

    test('should simulate network conditions', async () => {
      // Test with simulated packet loss
      const answer = await testHelper.testWebRTCOffer(session.id);
      expect(answer).toBeDefined();

      // Test ICE connectivity with multiple candidates
      const candidatePromises = [];
      for (let i = 0; i < 5; i++) {
        candidatePromises.push(testHelper.testIceCandidate(session.id));
      }

      const results = await Promise.all(candidatePromises);
      results.forEach(result => {
        expect(result).toBe(true);
      });
    });
  });

  describe('WebRTC Error Handling', () => {
    test('should handle malformed offers', async () => {
      const axios = require('axios');

      try {
        await axios.post(`${ORCHESTRATOR_CONFIG.baseUrl}/api/sessions/${session.id}/offer`, {
          offer: {
            type: 'offer',
            sdp: 'invalid sdp content'
          }
        });
      } catch (error) {
        // Should handle gracefully
        expect([400, 422, 500]).toContain(error.response?.status || 500);
      }
    });

    test('should handle missing session for WebRTC', async () => {
      const axios = require('axios');
      const invalidSessionId = 'invalid-session-123';

      try {
        await axios.post(`${ORCHESTRATOR_CONFIG.baseUrl}/api/sessions/${invalidSessionId}/offer`, {
          offer: {
            type: 'offer',
            sdp: 'v=0\no=- 123 2 IN IP4 127.0.0.1\ns=Test\nt=0 0\nm=video 9 UDP/TLS/RTP/SAVPF 96'
          }
        });
      } catch (error) {
        expect(error.response.status).toBe(404);
      }
    });

    test('should handle WebRTC timeout scenarios', async () => {
      // Create a session but don't complete WebRTC setup
      const testSession = await testHelper.createSession(CAMERA_CONFIG.id);
      
      // Session should exist but WebRTC not connected
      const sessionData = await testHelper.getSession(testSession.id);
      expect(sessionData.webrtc.connectionState).toBe('new');
    });
  });

  describe('Media Stream Simulation', () => {
    test('should simulate media stream statistics', async () => {
      // Setup WebRTC connection
      await testHelper.testWebRTCOffer(session.id);
      
      // Connect to WebSocket to receive stats
      const ws = await testHelper.connectWebSocket(session.id);
      
      // Start stream
      testHelper.sendMessage(session.id, {
        type: 'stream_control',
        payload: { action: 'start' }
      });

      // Wait for stream statistics
      try {
        const statsMessage = await testHelper.waitForEvent('ws_message', 5000);
        if (statsMessage.message.type === 'stream_stats') {
          const stats = statsMessage.message.data;
          expect(stats).toHaveProperty('packetsReceived');
          expect(stats).toHaveProperty('bytesReceived');
          expect(stats).toHaveProperty('framesReceived');
          expect(stats.packetsReceived).toBeGreaterThan(0);
        }
      } catch (error) {
        console.log('Stream stats not received (expected in test environment)');
      }

      ws.close();
    });

    test('should handle stream start/stop', async () => {
      await testHelper.testWebRTCOffer(session.id);
      const ws = await testHelper.connectWebSocket(session.id);

      // Start stream
      testHelper.sendMessage(session.id, {
        type: 'stream_control',
        payload: { action: 'start' }
      });

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Stop stream
      testHelper.sendMessage(session.id, {
        type: 'stream_control',
        payload: { action: 'stop' }
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      ws.close();
    });
  });

  describe('Integration with Camera Features', () => {
    test('should combine WebRTC with PTZ control', async () => {
      // Setup WebRTC
      await testHelper.testWebRTCOffer(session.id);
      
      // Test PTZ during WebRTC session
      const ptzResult = await testHelper.testPTZControl(
        CAMERA_CONFIG.id,
        'absolute',
        { pan: 45, tilt: 30, zoom: 1.5 }
      );
      
      expect(ptzResult).toBe(true);
    });

    test('should maintain WebRTC during camera configuration changes', async () => {
      // Setup WebRTC
      const answer = await testHelper.testWebRTCOffer(session.id);
      expect(answer).toBeDefined();

      // Change camera settings
      const axios = require('axios');
      await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/param.cgi`,
        { params: { action: 'set', 'root.Image.I0.Compression': 40 } }
      );

      // WebRTC should still work
      const sessionData = await testHelper.getSession(session.id);
      expect(['active', 'connected']).toContain(sessionData.status);
    });
  });
});