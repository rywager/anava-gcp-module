#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const MockAxisCameraServer = require('./mocks/axis-camera-server');
const MockCloudOrchestrator = require('./mocks/cloud-orchestrator');

class TestRunner {
  constructor() {
    this.cameraServer = null;
    this.orchestrator = null;
    this.testProcesses = [];
    
    this.config = {
      camera: {
        port: parseInt(process.env.CAMERA_PORT) || 8080,
        wsPort: parseInt(process.env.CAMERA_WS_PORT) || 8081,
        id: process.env.CAMERA_ID || 'ACCC8EF85A3C',
        model: process.env.CAMERA_MODEL || 'AXIS P3245-V'
      },
      orchestrator: {
        port: parseInt(process.env.ORCHESTRATOR_PORT) || 3000,
        wsPort: parseInt(process.env.ORCHESTRATOR_WS_PORT) || 3001
      },
      tests: {
        timeout: parseInt(process.env.TEST_TIMEOUT) || 60000,
        verbose: process.env.VERBOSE === 'true',
        coverage: process.env.COVERAGE === 'true'
      }
    };
  }

  async startMockServices() {
    console.log('🚀 Starting mock services...');
    
    try {
      // Start camera server
      this.cameraServer = new MockAxisCameraServer({
        port: this.config.camera.port,
        wsPort: this.config.camera.wsPort,
        cameraId: this.config.camera.id,
        model: this.config.camera.model
      });
      
      await this.cameraServer.start();
      console.log(`✅ Mock camera server started on port ${this.config.camera.port}`);
      
      // Start orchestrator
      this.orchestrator = new MockCloudOrchestrator({
        port: this.config.orchestrator.port,
        wsPort: this.config.orchestrator.wsPort
      });
      
      await this.orchestrator.start();
      console.log(`✅ Mock orchestrator started on port ${this.config.orchestrator.port}`);
      
      // Wait for services to be ready
      await this.waitForServices();
      console.log('✅ All mock services are ready');
      
    } catch (error) {
      console.error('❌ Failed to start mock services:', error);
      throw error;
    }
  }

  async waitForServices() {
    const axios = require('axios');
    const maxAttempts = 10;
    const delay = 1000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Check camera health
        await axios.get(`http://localhost:${this.config.camera.port}/health`, { timeout: 2000 });
        
        // Check orchestrator health
        await axios.get(`http://localhost:${this.config.orchestrator.port}/health`, { timeout: 2000 });
        
        return; // Both services are ready
      } catch (error) {
        if (attempt === maxAttempts) {
          throw new Error('Services failed to become ready within timeout');
        }
        
        console.log(`⏳ Waiting for services... (attempt ${attempt}/${maxAttempts})`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async stopMockServices() {
    console.log('🛑 Stopping mock services...');
    
    if (this.cameraServer) {
      await this.cameraServer.stop();
      console.log('✅ Camera server stopped');
    }
    
    if (this.orchestrator) {
      await this.orchestrator.stop();
      console.log('✅ Orchestrator stopped');
    }
  }

  async runTests(testType = 'all') {
    const testCommands = {
      integration: ['npx', 'jest', '--config=jest.config.js', '--testPathPattern=tests/integration'],
      e2e: ['npx', 'jest', '--config=jest.config.js', '--testPathPattern=tests/e2e'],
      performance: ['npx', 'jest', '--config=jest.config.js', '--testPathPattern=performance'],
      load: ['node', 'load/websocket-load.js'],
      artillery: ['npx', 'artillery', 'run', 'load/scenarios.yml'],
      all: ['npx', 'jest', '--config=jest.config.js']
    };

    if (this.config.tests.coverage) {
      testCommands.integration.push('--coverage');
      testCommands.e2e.push('--coverage');
      testCommands.all.push('--coverage');
    }

    if (this.config.tests.verbose) {
      testCommands.integration.push('--verbose');
      testCommands.e2e.push('--verbose');
      testCommands.performance.push('--verbose');
      testCommands.all.push('--verbose');
    }

    const command = testCommands[testType];
    if (!command) {
      throw new Error(`Unknown test type: ${testType}. Available: ${Object.keys(testCommands).join(', ')}`);
    }

    console.log(`🧪 Running ${testType} tests...`);
    console.log(`Command: ${command.join(' ')}`);

    return new Promise((resolve, reject) => {
      const testProcess = spawn(command[0], command.slice(1), {
        stdio: 'inherit',
        cwd: process.cwd(),
        env: {
          ...process.env,
          NODE_ENV: 'test',
          CAMERA_PORT: this.config.camera.port.toString(),
          CAMERA_WS_PORT: this.config.camera.wsPort.toString(),
          ORCHESTRATOR_PORT: this.config.orchestrator.port.toString(),
          ORCHESTRATOR_WS_PORT: this.config.orchestrator.wsPort.toString()
        }
      });

      this.testProcesses.push(testProcess);

      testProcess.on('close', (code) => {
        this.testProcesses = this.testProcesses.filter(p => p !== testProcess);
        
        if (code === 0) {
          console.log(`✅ ${testType} tests completed successfully`);
          resolve(code);
        } else {
          console.error(`❌ ${testType} tests failed with exit code ${code}`);
          reject(new Error(`Tests failed with exit code ${code}`));
        }
      });

      testProcess.on('error', (error) => {
        console.error(`❌ Failed to start ${testType} tests:`, error);
        reject(error);
      });
    });
  }

  async runTestSuite(suites = ['integration', 'e2e']) {
    let allPassed = true;
    const results = {};

    for (const suite of suites) {
      try {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Running ${suite.toUpperCase()} Test Suite`);
        console.log(`${'='.repeat(60)}`);
        
        const startTime = Date.now();
        await this.runTests(suite);
        const duration = Date.now() - startTime;
        
        results[suite] = { success: true, duration };
        console.log(`✅ ${suite} suite completed in ${(duration / 1000).toFixed(2)}s`);
        
      } catch (error) {
        results[suite] = { success: false, error: error.message };
        console.error(`❌ ${suite} suite failed:`, error.message);
        allPassed = false;
        
        // Continue with other suites unless explicitly stopped
        if (process.env.FAIL_FAST === 'true') {
          break;
        }
      }
    }

    return { allPassed, results };
  }

  async generateReport(results) {
    const reportPath = path.join(process.cwd(), 'test-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      config: this.config,
      results,
      summary: {
        total: Object.keys(results).length,
        passed: Object.values(results).filter(r => r.success).length,
        failed: Object.values(results).filter(r => !r.success).length
      }
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📊 Test report saved to: ${reportPath}`);

    return report;
  }

  async cleanup() {
    console.log('🧹 Cleaning up...');
    
    // Stop test processes
    this.testProcesses.forEach(process => {
      if (!process.killed) {
        process.kill('SIGTERM');
      }
    });

    // Stop mock services
    await this.stopMockServices();
    
    console.log('✅ Cleanup completed');
  }

  async run() {
    const args = process.argv.slice(2);
    const testType = args[0] || 'all';
    const suites = args.length > 1 ? args : null;

    try {
      // Setup signal handlers for graceful shutdown
      process.on('SIGINT', async () => {
        console.log('\n🛑 Received SIGINT, shutting down gracefully...');
        await this.cleanup();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
        await this.cleanup();
        process.exit(0);
      });

      // Start mock services
      await this.startMockServices();

      let results;
      if (suites) {
        // Run specific test suites
        const { allPassed, results: suiteResults } = await this.runTestSuite(suites);
        results = suiteResults;
        
        if (!allPassed) {
          process.exit(1);
        }
      } else if (testType === 'all') {
        // Run all test suites
        const { allPassed, results: suiteResults } = await this.runTestSuite(['integration', 'e2e', 'performance']);
        results = suiteResults;
        
        if (!allPassed) {
          process.exit(1);
        }
      } else {
        // Run specific test type
        await this.runTests(testType);
        results = { [testType]: { success: true, duration: 0 } };
      }

      // Generate report
      const report = await this.generateReport(results);
      
      console.log('\n🎉 All tests completed successfully!');
      console.log(`📊 Summary: ${report.summary.passed}/${report.summary.total} test suites passed`);

    } catch (error) {
      console.error('\n❌ Test run failed:', error.message);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }
}

// Show usage information
function showUsage() {
  console.log(`
Usage: node run-tests.js [test-type] [additional-suites...]

Test Types:
  integration  - Run integration tests only
  e2e         - Run end-to-end tests only  
  performance - Run performance tests only
  load        - Run WebSocket load tests
  artillery   - Run Artillery HTTP load tests
  all         - Run all test suites (default)

Examples:
  node run-tests.js                    # Run all tests
  node run-tests.js integration        # Run integration tests only
  node run-tests.js integration e2e    # Run integration and e2e tests
  node run-tests.js performance        # Run performance tests only

Environment Variables:
  CAMERA_PORT=8080          # Mock camera HTTP port
  CAMERA_WS_PORT=8081       # Mock camera WebSocket port
  ORCHESTRATOR_PORT=3000    # Mock orchestrator HTTP port
  ORCHESTRATOR_WS_PORT=3001 # Mock orchestrator WebSocket port
  TEST_TIMEOUT=60000        # Test timeout in milliseconds
  VERBOSE=true              # Enable verbose output
  COVERAGE=true             # Enable coverage reporting
  FAIL_FAST=true            # Stop on first failure
`);
}

// Run if executed directly
if (require.main === module) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    showUsage();
    process.exit(0);
  }

  const runner = new TestRunner();
  runner.run().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = TestRunner;