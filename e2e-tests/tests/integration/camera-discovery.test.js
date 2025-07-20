const { TestHelper } = require('../../src/test-utils');
const MockAxisCameraServer = require('../../mocks/axis-camera-server');
const MockCloudOrchestrator = require('../../mocks/cloud-orchestrator');

describe('Camera Discovery Integration Tests', () => {
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

  describe('Basic Camera Discovery', () => {
    test('should discover camera via HTTP API', async () => {
      const discovered = await testHelper.discoverCamera();
      expect(discovered).toBe(true);
    });

    test('should respond to ONVIF discovery', async () => {
      const onvifResponse = await testHelper.testOnvifDiscovery();
      expect(onvifResponse).toBe(true);
    });

    test('should return camera device information', async () => {
      const axios = require('axios');
      const response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/basicdeviceinfo.cgi`
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        HardwareID: CAMERA_CONFIG.id,
        ProdShortName: CAMERA_CONFIG.model,
        Brand: 'AXIS'
      });
    });
  });

  describe('Camera Registration', () => {
    test('should register camera with orchestrator', async () => {
      const registered = await testHelper.registerCamera();
      expect(registered).toBe(true);
    });

    test('should list registered cameras', async () => {
      const axios = require('axios');
      const response = await axios.get(`${ORCHESTRATOR_CONFIG.baseUrl}/api/cameras`);

      expect(response.status).toBe(200);
      expect(response.data.cameras).toBeInstanceOf(Array);
      expect(response.data.cameras.length).toBeGreaterThan(0);
      
      const camera = response.data.cameras.find(c => c.id === CAMERA_CONFIG.id);
      expect(camera).toBeDefined();
      expect(camera.status).toBe('online');
    });

    test('should get specific camera details', async () => {
      const axios = require('axios');
      const response = await axios.get(
        `${ORCHESTRATOR_CONFIG.baseUrl}/api/cameras/${CAMERA_CONFIG.id}`
      );

      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        id: CAMERA_CONFIG.id,
        model: CAMERA_CONFIG.model,
        status: 'online'
      });
    });
  });

  describe('Camera Capabilities', () => {
    test('should detect PTZ capabilities', async () => {
      const axios = require('axios');
      const response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/param.cgi?action=list&group=root.PTZ`
      );

      expect(response.status).toBe(200);
      expect(response.data).toContain('root.PTZ.PTZ.Enabled=yes');
    });

    test('should detect video streaming capabilities', async () => {
      const axios = require('axios');
      const response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/param.cgi?action=list&group=root.Image`
      );

      expect(response.status).toBe(200);
      expect(response.data).toContain('root.Image.I0.Enabled=yes');
    });

    test('should get RTSP URL', async () => {
      const axios = require('axios');
      const response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/rtspurl.cgi`
      );

      expect(response.status).toBe(200);
      expect(response.data).toContain('rtsp://');
    });
  });

  describe('Camera Network Tests', () => {
    test('should respond to ping', async () => {
      const { spawn } = require('child_process');
      
      return new Promise((resolve) => {
        const ping = spawn('ping', ['-c', '1', CAMERA_CONFIG.ip]);
        
        ping.on('close', (code) => {
          expect(code).toBe(0);
          resolve();
        });
      });
    });

    test('should have correct network parameters', async () => {
      const axios = require('axios');
      const response = await axios.get(
        `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/axis-cgi/param.cgi?action=list&group=root.Network`
      );

      expect(response.status).toBe(200);
      expect(response.data).toContain('root.Network.Interface.I0.Active=yes');
      expect(response.data).toContain('root.Network.RTSP.Port=554');
    });
  });

  describe('Error Handling', () => {
    test('should handle invalid camera requests gracefully', async () => {
      const axios = require('axios');
      
      try {
        await axios.get(
          `http://${CAMERA_CONFIG.ip}:${CAMERA_CONFIG.port}/invalid-endpoint`
        );
      } catch (error) {
        expect(error.response.status).toBe(404);
      }
    });

    test('should handle registration of non-existent camera', async () => {
      const axios = require('axios');
      
      try {
        await axios.post(`${ORCHESTRATOR_CONFIG.baseUrl}/api/cameras/register`, {
          id: 'INVALID_CAMERA',
          ip: '192.168.1.999',
          model: 'Invalid Model'
        });
      } catch (error) {
        // Should either fail or return error status
        expect([400, 404, 500]).toContain(error.response?.status || 500);
      }
    });
  });
});