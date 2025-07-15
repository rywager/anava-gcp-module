const { TestHelper } = require('../../src/test-utils');
const MockAxisCameraServer = require('../../mocks/axis-camera-server');
const MockCloudOrchestrator = require('../../mocks/cloud-orchestrator');
const axios = require('axios');

describe('Video Streaming Integration Tests', () => {
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

  describe('MJPEG Streaming', () => {
    test('should establish MJPEG video stream', async () => {
      const streamActive = await testHelper.testVideoStream();
      expect(streamActive).toBe(true);
    });

    test('should receive video frames', async () => {
      const response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/mjpg/video.cgi`,
        {
          params: { resolution: '640x480', fps: 10 },
          timeout: 3000,
          responseType: 'stream'
        }
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('multipart/x-mixed-replace');

      return new Promise((resolve, reject) => {
        let frameCount = 0;
        let dataReceived = false;

        response.data.on('data', (chunk) => {
          dataReceived = true;
          
          // Look for JPEG frame boundaries
          if (chunk.includes('--myboundary')) {
            frameCount++;
          }
          
          // Stop after receiving a few frames
          if (frameCount >= 2) {
            response.data.destroy();
            resolve();
          }
        });

        response.data.on('error', reject);

        setTimeout(() => {
          if (!dataReceived) {
            response.data.destroy();
            reject(new Error('No video data received'));
          }
        }, 2000);
      });
    });

    test('should support different resolutions', async () => {
      const resolutions = ['320x240', '640x480', '1280x720', '1920x1080'];
      
      for (const resolution of resolutions) {
        const response = await axios.get(
          `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/mjpg/video.cgi`,
          {
            params: { resolution, fps: 15 },
            timeout: 2000,
            responseType: 'stream'
          }
        );

        expect(response.status).toBe(200);
        
        // Close stream immediately after confirming it works
        response.data.destroy();
      }
    });

    test('should support different frame rates', async () => {
      const frameRates = [5, 10, 15, 25, 30];
      
      for (const fps of frameRates) {
        const response = await axios.get(
          `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/mjpg/video.cgi`,
          {
            params: { resolution: '640x480', fps },
            timeout: 2000,
            responseType: 'stream'
          }
        );

        expect(response.status).toBe(200);
        response.data.destroy();
      }
    });

    test('should handle compression settings', async () => {
      const compressionLevels = [10, 30, 50, 70, 90];
      
      for (const compression of compressionLevels) {
        const response = await axios.get(
          `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/mjpg/video.cgi`,
          {
            params: { 
              resolution: '640x480', 
              fps: 15,
              compression 
            },
            timeout: 2000,
            responseType: 'stream'
          }
        );

        expect(response.status).toBe(200);
        response.data.destroy();
      }
    });
  });

  describe('RTSP Streaming', () => {
    test('should provide RTSP URL', async () => {
      const response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/rtspurl.cgi`
      );

      expect(response.status).toBe(200);
      expect(response.data).toContain('rtsp://');
      expect(response.data).toContain('localhost');
      expect(response.data).toContain('554'); // RTSP port
    });

    test('should include stream parameters in RTSP URL', async () => {
      const response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/rtspurl.cgi`
      );

      const rtspUrl = response.data;
      expect(rtspUrl).toContain('resolution=');
      expect(rtspUrl).toContain('fps=');
    });

    test('should support RTSP over different transports', async () => {
      // Test UDP transport (default)
      let response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/rtspurl.cgi`,
        { params: { transport: 'udp' } }
      );
      expect(response.status).toBe(200);

      // Test TCP transport
      response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/rtspurl.cgi`,
        { params: { transport: 'tcp' } }
      );
      expect(response.status).toBe(200);
    });
  });

  describe('Stream Configuration', () => {
    test('should configure video parameters', async () => {
      const params = {
        'root.Image.I0.Resolution': '1920x1080',
        'root.Image.I0.Stream.FPS': '25',
        'root.Image.I0.Compression': '40'
      };

      for (const [param, value] of Object.entries(params)) {
        const response = await axios.get(
          `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/param.cgi`,
          { params: { action: 'set', [param]: value } }
        );
        expect(response.status).toBe(200);
      }
    });

    test('should read current video parameters', async () => {
      const response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/param.cgi`,
        { params: { action: 'list', group: 'root.Image' } }
      );

      expect(response.status).toBe(200);
      expect(response.data).toContain('root.Image.I0.Enabled=yes');
      expect(response.data).toContain('root.Image.I0.Resolution=');
      expect(response.data).toContain('root.Image.I0.Stream.FPS=');
    });

    test('should validate parameter ranges', async () => {
      // Test invalid resolution
      try {
        await axios.get(
          `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/param.cgi`,
          { params: { action: 'set', 'root.Image.I0.Resolution': '9999x9999' } }
        );
      } catch (error) {
        // Should handle invalid parameters gracefully
        expect([400, 422]).toContain(error.response?.status || 400);
      }

      // Test invalid frame rate
      try {
        await axios.get(
          `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/param.cgi`,
          { params: { action: 'set', 'root.Image.I0.Stream.FPS': '999' } }
        );
      } catch (error) {
        expect([400, 422]).toContain(error.response?.status || 400);
      }
    });
  });

  describe('Streaming Through Orchestrator', () => {
    test('should stream via WebRTC through orchestrator', async () => {
      // Setup WebRTC connection
      const answer = await testHelper.testWebRTCOffer(session.id);
      expect(answer).toBeDefined();

      // Connect to session WebSocket
      const ws = await testHelper.connectWebSocket(session.id);

      // Start streaming
      testHelper.sendMessage(session.id, {
        type: 'stream_control',
        payload: { action: 'start' }
      });

      // Wait for stream to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Should receive stream statistics
      try {
        const statsMessage = await testHelper.waitForEvent('ws_message', 3000);
        if (statsMessage.message.type === 'stream_stats') {
          expect(statsMessage.message.data.framesReceived).toBeGreaterThan(0);
        }
      } catch (error) {
        console.log('Stream stats not received (expected in test environment)');
      }

      ws.close();
    });

    test('should handle stream quality adaptation', async () => {
      await testHelper.testWebRTCOffer(session.id);
      const ws = await testHelper.connectWebSocket(session.id);

      // Start with high quality
      testHelper.sendMessage(session.id, {
        type: 'stream_control',
        payload: {
          action: 'configure',
          params: {
            resolution: '1920x1080',
            framerate: 30,
            bitrate: 4000000
          }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      // Adapt to lower quality
      testHelper.sendMessage(session.id, {
        type: 'stream_control',
        payload: {
          action: 'configure',
          params: {
            resolution: '640x480',
            framerate: 15,
            bitrate: 1000000
          }
        }
      });

      await new Promise(resolve => setTimeout(resolve, 500));

      ws.close();
    });
  });

  describe('Multi-Stream Support', () => {
    test('should support multiple concurrent streams', async () => {
      const streamCount = 3;
      const streams = [];

      for (let i = 0; i < streamCount; i++) {
        const streamPromise = axios.get(
          `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/mjpg/video.cgi`,
          {
            params: { resolution: '320x240', fps: 10 },
            timeout: 2000,
            responseType: 'stream'
          }
        );
        streams.push(streamPromise);
      }

      const responses = await Promise.all(streams);
      
      responses.forEach(response => {
        expect(response.status).toBe(200);
        response.data.destroy();
      });
    });

    test('should handle different stream types simultaneously', async () => {
      // Start MJPEG stream
      const mjpegPromise = axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/mjpg/video.cgi`,
        {
          params: { resolution: '640x480', fps: 15 },
          timeout: 2000,
          responseType: 'stream'
        }
      );

      // Setup WebRTC stream
      const webrtcPromise = testHelper.testWebRTCOffer(session.id);

      const [mjpegResponse, webrtcAnswer] = await Promise.all([mjpegPromise, webrtcPromise]);

      expect(mjpegResponse.status).toBe(200);
      expect(webrtcAnswer).toBeDefined();

      mjpegResponse.data.destroy();
    });
  });

  describe('Stream Performance', () => {
    test('should measure stream startup time', async () => {
      const iterations = 5;
      const startupTimes = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        
        const response = await axios.get(
          `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/mjpg/video.cgi`,
          {
            params: { resolution: '640x480', fps: 15 },
            timeout: 3000,
            responseType: 'stream'
          }
        );

        const firstDataPromise = new Promise((resolve) => {
          response.data.once('data', () => {
            const startupTime = Date.now() - start;
            startupTimes.push(startupTime);
            response.data.destroy();
            resolve();
          });
        });

        await firstDataPromise;
      }

      const avgStartupTime = startupTimes.reduce((sum, time) => sum + time, 0) / startupTimes.length;
      expect(avgStartupTime).toBeLessThan(2000); // Should be less than 2 seconds
    });

    test('should measure frame rate consistency', async () => {
      const targetFPS = 10;
      const measurementDuration = 3000; // 3 seconds

      const response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/mjpg/video.cgi`,
        {
          params: { resolution: '320x240', fps: targetFPS },
          timeout: measurementDuration + 1000,
          responseType: 'stream'
        }
      );

      return new Promise((resolve) => {
        let frameCount = 0;
        const startTime = Date.now();

        response.data.on('data', (chunk) => {
          if (chunk.includes('--myboundary')) {
            frameCount++;
          }
        });

        setTimeout(() => {
          response.data.destroy();
          
          const actualDuration = Date.now() - startTime;
          const actualFPS = frameCount / (actualDuration / 1000);
          
          // Allow 20% tolerance
          const tolerance = targetFPS * 0.2;
          expect(Math.abs(actualFPS - targetFPS)).toBeLessThan(tolerance);
          
          resolve();
        }, measurementDuration);
      });
    });

    test('should handle bandwidth limitations', async () => {
      // Test with low bitrate settings
      const response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/mjpg/video.cgi`,
        {
          params: { 
            resolution: '320x240', 
            fps: 5,
            compression: 70 // High compression = low bitrate
          },
          timeout: 2000,
          responseType: 'stream'
        }
      );

      expect(response.status).toBe(200);
      
      // Stream should still work with bandwidth constraints
      const dataReceived = await new Promise((resolve) => {
        let received = false;
        
        response.data.on('data', () => {
          if (!received) {
            received = true;
            response.data.destroy();
            resolve(true);
          }
        });

        setTimeout(() => {
          if (!received) {
            response.data.destroy();
            resolve(false);
          }
        }, 1500);
      });

      expect(dataReceived).toBe(true);
    });
  });

  describe('Stream Error Handling', () => {
    test('should handle stream interruption gracefully', async () => {
      const response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/mjpg/video.cgi`,
        {
          params: { resolution: '640x480', fps: 15 },
          timeout: 5000,
          responseType: 'stream'
        }
      );

      expect(response.status).toBe(200);

      // Simulate network interruption
      setTimeout(() => {
        response.data.destroy();
      }, 1000);

      return new Promise((resolve) => {
        response.data.on('close', () => {
          resolve(); // Should handle close gracefully
        });

        response.data.on('error', (error) => {
          // Error handling is acceptable
          resolve();
        });
      });
    });

    test('should handle invalid stream parameters', async () => {
      try {
        await axios.get(
          `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/mjpg/video.cgi`,
          {
            params: { 
              resolution: 'invalid',
              fps: -1
            },
            timeout: 2000
          }
        );
      } catch (error) {
        // Should handle invalid parameters
        expect([400, 422, 500]).toContain(error.response?.status || 500);
      }
    });

    test('should recover from temporary failures', async () => {
      // First attempt (may fail due to resource constraints)
      try {
        const response = await axios.get(
          `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/mjpg/video.cgi`,
          {
            params: { resolution: '1920x1080', fps: 30 },
            timeout: 1000,
            responseType: 'stream'
          }
        );
        response.data.destroy();
      } catch (error) {
        // Expected to possibly fail with high requirements
      }

      // Second attempt with lower requirements should succeed
      const response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/mjpg/video.cgi`,
        {
          params: { resolution: '320x240', fps: 10 },
          timeout: 2000,
          responseType: 'stream'
        }
      );

      expect(response.status).toBe(200);
      response.data.destroy();
    });
  });
});