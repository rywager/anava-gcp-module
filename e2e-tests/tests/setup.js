// Global test setup
const { performance } = require('perf_hooks');

// Increase timeout for integration tests
jest.setTimeout(60000);

// Global test utilities
global.testUtils = {
  sleep: (ms) => new Promise(resolve => setTimeout(resolve, ms)),
  
  measureTime: async (fn) => {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    return { result, duration: end - start };
  },
  
  retry: async (fn, maxAttempts = 3, delay = 1000) => {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        console.log(`Attempt ${attempt} failed: ${error.message}`);
        
        if (attempt < maxAttempts) {
          await global.testUtils.sleep(delay);
        }
      }
    }
    
    throw lastError;
  },
  
  waitFor: async (condition, timeout = 5000, interval = 100) => {
    const start = Date.now();
    
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return true;
      }
      await global.testUtils.sleep(interval);
    }
    
    throw new Error(`Condition not met within ${timeout}ms`);
  },
  
  randomId: () => Math.random().toString(36).substring(2, 15),
  
  randomPort: () => Math.floor(Math.random() * (65535 - 1024)) + 1024,
  
  isPortAvailable: async (port) => {
    const net = require('net');
    return new Promise((resolve) => {
      const server = net.createServer();
      server.listen(port, () => {
        server.once('close', () => resolve(true));
        server.close();
      });
      server.on('error', () => resolve(false));
    });
  }
};

// Console enhancement for better test output
const originalLog = console.log;
console.log = (...args) => {
  const timestamp = new Date().toISOString().substring(11, 23);
  originalLog(`[${timestamp}]`, ...args);
};

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
});

// Global cleanup
afterAll(async () => {
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  // Small delay to allow cleanup
  await global.testUtils.sleep(100);
});