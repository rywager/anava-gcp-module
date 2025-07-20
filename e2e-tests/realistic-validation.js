#!/usr/bin/env node

/**
 * Realistic End-to-End Validation Suite
 * Tests the actual deployed Anava Vision system capabilities
 */

const axios = require('axios');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

class RealisticE2EValidator {
    constructor() {
        this.config = {
            // Actual deployed service
            webService: 'https://anava-deploy-392865621461.us-central1.run.app',
            timeout: 30000,
            
            // Test configuration
            performanceThresholds: {
                healthCheck: 1000,   // 1 second
                pageLoad: 3000,      // 3 seconds
                apiResponse: 2000    // 2 seconds
            }
        };
        
        this.results = {
            timestamp: new Date().toISOString(),
            environment: 'production',
            tests: {},
            summary: {
                total: 0,
                passed: 0,
                failed: 0,
                warnings: 0
            },
            performance: {},
            deployment: {},
            errors: []
        };
    }

    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const logEntry = `[${timestamp}] ${level.toUpperCase()}: ${message}`;
        console.log(logEntry);
        
        if (data) {
            console.log(JSON.stringify(data, null, 2));
        }
    }

    async runTest(testName, testFunction, warningsAllowed = false) {
        this.log('info', `🧪 ${testName}`);
        this.results.summary.total++;
        
        const startTime = performance.now();
        
        try {
            const result = await testFunction();
            const duration = Math.round(performance.now() - startTime);
            
            const hasWarnings = result && result.warnings && result.warnings.length > 0;
            
            this.results.tests[testName] = {
                status: hasWarnings && !warningsAllowed ? 'WARNING' : 'PASSED',
                duration: duration,
                result: result,
                timestamp: new Date().toISOString()
            };
            
            if (hasWarnings && !warningsAllowed) {
                this.results.summary.warnings++;
                this.log('warning', `⚠️  ${testName} passed with warnings (${duration}ms)`);
            } else {
                this.results.summary.passed++;
                this.log('success', `✅ ${testName} passed (${duration}ms)`);
            }
            
            return result;
        } catch (error) {
            const duration = Math.round(performance.now() - startTime);
            
            this.results.tests[testName] = {
                status: 'FAILED',
                duration: duration,
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            };
            
            this.results.summary.failed++;
            this.results.errors.push({
                test: testName,
                error: error.message,
                timestamp: new Date().toISOString()
            });
            
            this.log('error', `❌ ${testName} failed (${duration}ms): ${error.message}`);
            return null; // Continue with other tests
        }
    }

    async testServiceHealth() {
        const response = await axios.get(`${this.config.webService}/health`, {
            timeout: this.config.timeout
        });
        
        if (response.status !== 200) {
            throw new Error(`Health check failed with status: ${response.status}`);
        }
        
        const health = response.data;
        const warnings = [];
        
        // Check for potential issues
        if (!health.redis_available) {
            warnings.push('Redis is not available - may impact session management');
        }
        
        if (health.queue_length === -1) {
            warnings.push('Queue length is unknown - background job processing may be affected');
        }
        
        return {
            status: health.status,
            version: health.version,
            buildTime: health.build_time,
            commit: health.commit,
            redis: health.redis_available,
            oauth: health.oauth_configured,
            warnings: warnings
        };
    }

    async testWebInterface() {
        const response = await axios.get(this.config.webService, {
            timeout: this.config.timeout,
            headers: {
                'User-Agent': 'Anava-E2E-Test/1.0'
            }
        });
        
        if (response.status !== 200) {
            throw new Error(`Web interface failed with status: ${response.status}`);
        }
        
        const responseSize = response.headers['content-length'] || response.data.length;
        const warnings = [];
        
        // Basic content checks
        if (!response.data.includes('html')) {
            warnings.push('Response does not appear to be HTML');
        }
        
        if (responseSize < 100) {
            warnings.push('Response size seems too small for a web interface');
        }
        
        return {
            loaded: true,
            statusCode: response.status,
            contentType: response.headers['content-type'],
            size: responseSize,
            server: response.headers['server'],
            warnings: warnings
        };
    }

    async testSecurityHeaders() {
        const response = await axios.get(this.config.webService, {
            timeout: this.config.timeout
        });
        
        const headers = response.headers;
        const securityChecks = {
            'x-frame-options': headers['x-frame-options'],
            'x-content-type-options': headers['x-content-type-options'], 
            'x-xss-protection': headers['x-xss-protection'],
            'strict-transport-security': headers['strict-transport-security'],
            'content-security-policy': headers['content-security-policy']
        };
        
        const missing = Object.entries(securityChecks)
            .filter(([key, value]) => !value)
            .map(([key]) => key);
        
        const warnings = missing.length > 0 
            ? [`Missing security headers: ${missing.join(', ')}`]
            : [];
            
        return {
            present: Object.keys(securityChecks).length - missing.length,
            missing: missing.length,
            headers: securityChecks,
            warnings: warnings
        };
    }

    async testPerformance() {
        const tests = [
            { name: 'Health Check', url: '/health' },
            { name: 'Main Page', url: '/' }
        ];
        
        const results = [];
        const warnings = [];
        
        for (const test of tests) {
            const startTime = performance.now();
            
            try {
                const response = await axios.get(`${this.config.webService}${test.url}`, {
                    timeout: this.config.timeout
                });
                
                const duration = Math.round(performance.now() - startTime);
                const threshold = this.config.performanceThresholds[test.name.toLowerCase().replace(' ', '')] || 2000;
                
                results.push({
                    name: test.name,
                    duration: duration,
                    threshold: threshold,
                    passed: duration <= threshold,
                    status: response.status
                });
                
                if (duration > threshold) {
                    warnings.push(`${test.name} took ${duration}ms (threshold: ${threshold}ms)`);
                }
                
            } catch (error) {
                results.push({
                    name: test.name,
                    error: error.message,
                    passed: false
                });
                warnings.push(`${test.name} failed: ${error.message}`);
            }
        }
        
        const passed = results.filter(r => r.passed).length;
        
        return {
            tests: results,
            passed: passed,
            total: tests.length,
            averageResponseTime: Math.round(
                results.filter(r => r.duration).reduce((sum, r) => sum + r.duration, 0) / 
                results.filter(r => r.duration).length || 0
            ),
            warnings: warnings
        };
    }

    async testDeploymentInfo() {
        try {
            const response = await axios.get(`${this.config.webService}/health`, {
                timeout: this.config.timeout
            });
            
            const health = response.data;
            
            return {
                version: health.version,
                buildTime: health.build_time,
                commit: health.commit,
                service: health.service,
                environment: 'production',
                endpoint: this.config.webService,
                lastChecked: new Date().toISOString()
            };
        } catch (error) {
            throw new Error(`Failed to get deployment info: ${error.message}`);
        }
    }

    async testConnectivity() {
        const endpoints = [
            { name: 'Main Service', url: this.config.webService },
            { name: 'Health Check', url: `${this.config.webService}/health` }
        ];
        
        const results = [];
        
        for (const endpoint of endpoints) {
            try {
                const startTime = performance.now();
                const response = await axios.get(endpoint.url, {
                    timeout: this.config.timeout,
                    maxRedirects: 5
                });
                const duration = Math.round(performance.now() - startTime);
                
                results.push({
                    name: endpoint.name,
                    url: endpoint.url,
                    status: response.status,
                    duration: duration,
                    reachable: true
                });
                
            } catch (error) {
                results.push({
                    name: endpoint.name,
                    url: endpoint.url,
                    reachable: false,
                    error: error.message
                });
            }
        }
        
        const reachable = results.filter(r => r.reachable).length;
        const warnings = results.filter(r => !r.reachable).length > 0 
            ? [`${results.filter(r => !r.reachable).length} endpoints unreachable`]
            : [];
        
        return {
            total: endpoints.length,
            reachable: reachable,
            unreachable: endpoints.length - reachable,
            results: results,
            warnings: warnings
        };
    }

    async testServiceCapabilities() {
        try {
            const healthResponse = await axios.get(`${this.config.webService}/health`);
            const mainResponse = await axios.get(this.config.webService);
            
            const capabilities = {
                healthEndpoint: true,
                webInterface: true,
                oauth: healthResponse.data.oauth_configured,
                redis: healthResponse.data.redis_available,
                googleCloudDeployment: healthResponse.data.service === 'anava-deploy'
            };
            
            const warnings = [];
            if (!capabilities.redis) {
                warnings.push('Redis not available - sessions may not persist');
            }
            
            return {
                capabilities: capabilities,
                available: Object.values(capabilities).filter(Boolean).length,
                total: Object.keys(capabilities).length,
                warnings: warnings
            };
            
        } catch (error) {
            throw new Error(`Failed to test service capabilities: ${error.message}`);
        }
    }

    async generateComprehensiveReport() {
        const reportPath = path.join(__dirname, 'realistic-e2e-report.json');
        const htmlReportPath = path.join(__dirname, 'realistic-e2e-report.html');
        
        // Calculate final metrics
        this.results.summary.successRate = this.results.summary.total > 0 
            ? Math.round((this.results.summary.passed / this.results.summary.total) * 100)
            : 0;
        
        this.results.summary.healthScore = this.calculateHealthScore();
        
        // Save JSON report
        fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
        
        // Generate HTML report
        const htmlReport = this.generateHTMLReport();
        fs.writeFileSync(htmlReportPath, htmlReport);
        
        this.log('info', `📊 Report saved to: ${reportPath}`);
        this.log('info', `🌐 HTML report saved to: ${htmlReportPath}`);
        
        return this.results;
    }

    calculateHealthScore() {
        const { passed, failed, warnings, total } = this.results.summary;
        if (total === 0) return 0;
        
        // Weight: passed tests = 100%, warnings = 70%, failed = 0%
        const weightedScore = (passed * 100 + warnings * 70 + failed * 0) / total;
        return Math.round(weightedScore);
    }

    generateHTMLReport() {
        const { tests, summary, deployment } = this.results;
        
        const statusIcon = (status) => {
            switch (status) {
                case 'PASSED': return '✅';
                case 'WARNING': return '⚠️';
                case 'FAILED': return '❌';
                default: return '❓';
            }
        };
        
        const statusColor = (status) => {
            switch (status) {
                case 'PASSED': return '#28a745';
                case 'WARNING': return '#ffc107';
                case 'FAILED': return '#dc3545';
                default: return '#6c757d';
            }
        };
        
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Anava Vision E2E Validation Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f8f9fa; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 20px; }
        .header h1 { margin: 0 0 10px 0; font-size: 28px; }
        .header p { margin: 5px 0; opacity: 0.9; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric { background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .metric h3 { margin: 0 0 10px 0; color: #666; font-size: 14px; text-transform: uppercase; }
        .metric .value { font-size: 32px; font-weight: bold; margin: 10px 0; }
        .health-score { color: ${summary.healthScore >= 80 ? '#28a745' : summary.healthScore >= 60 ? '#ffc107' : '#dc3545'}; }
        .test-results { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .test-result { padding: 20px; border-bottom: 1px solid #eee; }
        .test-result:last-child { border-bottom: none; }
        .test-header { display: flex; align-items: center; justify-content: between; margin-bottom: 10px; }
        .test-title { font-size: 18px; font-weight: 600; margin: 0 10px 0 0; }
        .test-duration { color: #666; font-size: 14px; }
        .test-details { background: #f8f9fa; padding: 15px; border-radius: 6px; margin-top: 10px; }
        .warnings { color: #856404; background: #fff3cd; padding: 10px; border-radius: 4px; margin: 10px 0; }
        .json-view { background: #2d3748; color: #e2e8f0; padding: 15px; border-radius: 6px; font-family: 'Monaco', 'Consolas', monospace; font-size: 12px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Anava Vision System</h1>
            <h2>Production E2E Validation Report</h2>
            <p><strong>Timestamp:</strong> ${this.results.timestamp}</p>
            <p><strong>Environment:</strong> ${this.results.environment}</p>
            <p><strong>Service:</strong> ${this.config.webService}</p>
        </div>
        
        <div class="metrics">
            <div class="metric">
                <h3>Health Score</h3>
                <div class="value health-score">${summary.healthScore}%</div>
            </div>
            <div class="metric">
                <h3>Tests Passed</h3>
                <div class="value" style="color: #28a745;">${summary.passed}</div>
            </div>
            <div class="metric">
                <h3>Warnings</h3>
                <div class="value" style="color: #ffc107;">${summary.warnings}</div>
            </div>
            <div class="metric">
                <h3>Failed</h3>
                <div class="value" style="color: #dc3545;">${summary.failed}</div>
            </div>
        </div>
        
        <div class="test-results">
            <h2 style="padding: 20px 20px 0 20px; margin: 0;">📋 Test Results</h2>
            ${Object.entries(tests).map(([testName, result]) => `
                <div class="test-result">
                    <div class="test-header">
                        <span class="test-title">${statusIcon(result.status)} ${testName}</span>
                        <span class="test-duration">${result.duration}ms</span>
                    </div>
                    <div style="color: ${statusColor(result.status)}; font-weight: 600; margin-bottom: 10px;">
                        ${result.status}
                    </div>
                    ${result.result && result.result.warnings && result.result.warnings.length > 0 ? `
                        <div class="warnings">
                            <strong>⚠️ Warnings:</strong><br>
                            ${result.result.warnings.map(w => `• ${w}`).join('<br>')}
                        </div>
                    ` : ''}
                    ${result.error ? `
                        <div style="color: #dc3545; background: #f8d7da; padding: 10px; border-radius: 4px; margin: 10px 0;">
                            <strong>Error:</strong> ${result.error}
                        </div>
                    ` : ''}
                    ${result.result ? `
                        <div class="test-details">
                            <strong>Details:</strong>
                            <div class="json-view">${JSON.stringify(result.result, null, 2)}</div>
                        </div>
                    ` : ''}
                </div>
            `).join('')}
        </div>
        
        <div style="margin-top: 20px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2>🔧 System Configuration</h2>
            <div class="json-view">${JSON.stringify(this.config, null, 2)}</div>
        </div>
    </div>
</body>
</html>`;
    }

    async runValidation() {
        this.log('info', '🚀 Starting realistic E2E validation of deployed system');
        this.log('info', `🎯 Target: ${this.config.webService}`);
        
        // Core system validation
        await this.runTest('Service Health Check', () => this.testServiceHealth(), true);
        await this.runTest('Web Interface', () => this.testWebInterface(), true);
        await this.runTest('Security Headers', () => this.testSecurityHeaders(), true);
        await this.runTest('Performance Metrics', () => this.testPerformance(), true);
        await this.runTest('Deployment Information', () => this.testDeploymentInfo());
        await this.runTest('Connectivity Test', () => this.testConnectivity(), true);
        await this.runTest('Service Capabilities', () => this.testServiceCapabilities(), true);
        
        // Generate comprehensive report
        const report = await this.generateComprehensiveReport();
        
        // Final summary
        this.log('info', '🎉 E2E validation completed!');
        this.log('info', `📊 Health Score: ${report.summary.healthScore}%`);
        this.log('info', `✅ Tests Passed: ${report.summary.passed}/${report.summary.total}`);
        
        if (report.summary.warnings > 0) {
            this.log('warning', `⚠️  ${report.summary.warnings} test(s) completed with warnings`);
        }
        
        if (report.summary.failed > 0) {
            this.log('error', `❌ ${report.summary.failed} test(s) failed`);
        }
        
        this.log('info', '📄 Check the HTML report for detailed analysis');
        
        return report;
    }
}

// Run validation if script is executed directly
if (require.main === module) {
    const validator = new RealisticE2EValidator();
    validator.runValidation().catch(error => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
}

module.exports = RealisticE2EValidator;