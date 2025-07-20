#!/usr/bin/env node

/**
 * Comprehensive System Validation Report
 * Combines all E2E test results into a complete system health report
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');

class ComprehensiveSystemValidator {
    constructor() {
        this.config = {
            // Known working endpoints
            webService: 'https://anava-deploy-392865621461.us-central1.run.app',
            
            // PWA endpoints (may not be deployed yet)
            pwaUrls: [
                'https://anava-vision-pwa.firebaseapp.com',
                'https://anava-vision-pwa.web.app'
            ],
            
            // Test configuration
            timeout: 30000
        };
        
        this.systemReport = {
            timestamp: new Date().toISOString(),
            version: '2.3.33',
            environment: 'production',
            components: {},
            summary: {
                totalComponents: 0,
                operational: 0,
                partiallyOperational: 0,
                notOperational: 0,
                overallHealth: 0
            },
            recommendations: [],
            nextSteps: []
        };
    }

    log(level, message, data = null) {
        const timestamp = new Date().toISOString();
        const emoji = {
            info: '📋',
            success: '✅',
            warning: '⚠️',
            error: '❌'
        }[level] || '📋';
        
        console.log(`[${timestamp}] ${emoji} ${message}`);
        if (data) {
            console.log(JSON.stringify(data, null, 2));
        }
    }

    async testComponent(name, testFunction) {
        this.log('info', `Testing ${name}...`);
        const startTime = performance.now();
        
        try {
            const result = await testFunction();
            const duration = Math.round(performance.now() - startTime);
            
            const status = this.determineComponentStatus(result);
            
            this.systemReport.components[name] = {
                status: status,
                duration: duration,
                result: result,
                timestamp: new Date().toISOString()
            };
            
            this.log(status === 'OPERATIONAL' ? 'success' : 
                    status === 'PARTIAL' ? 'warning' : 'error', 
                    `${name}: ${status} (${duration}ms)`);
            
            return result;
        } catch (error) {
            const duration = Math.round(performance.now() - startTime);
            
            this.systemReport.components[name] = {
                status: 'NOT_OPERATIONAL',
                duration: duration,
                error: error.message,
                timestamp: new Date().toISOString()
            };
            
            this.log('error', `${name}: NOT_OPERATIONAL (${duration}ms) - ${error.message}`);
            return null;
        }
    }

    determineComponentStatus(result) {
        if (!result) return 'NOT_OPERATIONAL';
        
        if (result.warnings && result.warnings.length > 0) {
            return 'PARTIAL';
        }
        
        return 'OPERATIONAL';
    }

    async testWebDeploymentService() {
        // Test the main deployment service
        const healthResponse = await axios.get(`${this.config.webService}/health`, {
            timeout: this.config.timeout
        });
        
        const mainResponse = await axios.get(this.config.webService, {
            timeout: this.config.timeout
        });
        
        const health = healthResponse.data;
        const warnings = [];
        
        // Check for issues
        if (!health.redis_available) {
            warnings.push('Redis unavailable - session management limited');
        }
        
        if (health.queue_length === -1) {
            warnings.push('Job queue status unknown');
        }
        
        return {
            name: 'Web Deployment Service',
            endpoint: this.config.webService,
            status: health.status,
            version: health.version,
            buildTime: health.build_time,
            commit: health.commit,
            oauth: health.oauth_configured,
            redis: health.redis_available,
            webInterface: mainResponse.status === 200,
            warnings: warnings
        };
    }

    async testCameraOrchestrator() {
        // Test camera orchestration capabilities
        try {
            // Try common orchestrator endpoints
            const healthResponse = await axios.get(`${this.config.webService}/api/health`, {
                timeout: this.config.timeout
            });
            
            return {
                name: 'Camera Orchestrator',
                available: true,
                endpoint: `${this.config.webService}/api`,
                status: healthResponse.data.status || 'unknown'
            };
        } catch (error) {
            return {
                name: 'Camera Orchestrator',
                available: false,
                warnings: ['Orchestrator API endpoints not accessible - camera management may be limited']
            };
        }
    }

    async testPWADeployment() {
        // Test PWA deployment status
        let workingUrl = null;
        const results = [];
        
        for (const url of this.config.pwaUrls) {
            try {
                const response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15'
                    }
                });
                
                if (response.status === 200) {
                    workingUrl = url;
                    results.push({ url, status: 'accessible', size: response.data.length });
                    break;
                }
            } catch (error) {
                results.push({ url, status: 'not_accessible', error: error.message });
            }
        }
        
        const warnings = workingUrl ? [] : ['PWA not deployed - mobile app functionality unavailable'];
        
        return {
            name: 'PWA Mobile App',
            deployed: !!workingUrl,
            workingUrl: workingUrl,
            testedUrls: results,
            warnings: warnings
        };
    }

    async testSystemConnectivity() {
        // Test overall system connectivity and integration
        const endpoints = [
            { name: 'Main Service', url: this.config.webService },
            { name: 'Health Check', url: `${this.config.webService}/health` },
            { name: 'OAuth Callback', url: `${this.config.webService}/callback` }
        ];
        
        const results = [];
        
        for (const endpoint of endpoints) {
            try {
                const startTime = performance.now();
                const response = await axios.get(endpoint.url, {
                    timeout: this.config.timeout,
                    maxRedirects: 0 // Don't follow redirects for oauth
                });
                const latency = Math.round(performance.now() - startTime);
                
                results.push({
                    name: endpoint.name,
                    url: endpoint.url,
                    status: response.status,
                    latency: latency,
                    reachable: true
                });
                
            } catch (error) {
                // OAuth callback will redirect, that's expected
                if (endpoint.name === 'OAuth Callback' && error.response && error.response.status === 302) {
                    results.push({
                        name: endpoint.name,
                        url: endpoint.url,
                        status: 302,
                        reachable: true,
                        note: 'OAuth redirect working'
                    });
                } else {
                    results.push({
                        name: endpoint.name,
                        url: endpoint.url,
                        reachable: false,
                        error: error.message
                    });
                }
            }
        }
        
        const reachable = results.filter(r => r.reachable).length;
        const avgLatency = Math.round(
            results.filter(r => r.latency).reduce((sum, r) => sum + r.latency, 0) / 
            results.filter(r => r.latency).length || 0
        );
        
        return {
            name: 'System Connectivity',
            endpoints: results,
            reachableCount: reachable,
            totalCount: endpoints.length,
            averageLatency: avgLatency,
            warnings: reachable < endpoints.length ? ['Some endpoints unreachable'] : []
        };
    }

    async testInfrastructureHealth() {
        // Test underlying infrastructure health
        const healthResponse = await axios.get(`${this.config.webService}/health`);
        const health = healthResponse.data;
        
        const infrastructure = {
            cloudRun: true, // Service is responding
            googleCloud: true, // Deployed on GCP
            https: this.config.webService.startsWith('https://'),
            redis: health.redis_available,
            oauth: health.oauth_configured,
            monitoring: !!health.timestamp
        };
        
        const warnings = [];
        if (!infrastructure.redis) warnings.push('Redis not available - may impact scalability');
        
        return {
            name: 'Infrastructure Health',
            components: infrastructure,
            operationalCount: Object.values(infrastructure).filter(Boolean).length,
            totalCount: Object.keys(infrastructure).length,
            warnings: warnings
        };
    }

    calculateOverallHealth() {
        const components = Object.values(this.systemReport.components);
        const total = components.length;
        
        if (total === 0) return 0;
        
        const operational = components.filter(c => c.status === 'OPERATIONAL').length;
        const partial = components.filter(c => c.status === 'PARTIAL').length;
        
        // Weight: operational = 100%, partial = 70%, not operational = 0%
        const weightedScore = (operational * 100 + partial * 70) / total;
        
        this.systemReport.summary = {
            totalComponents: total,
            operational: operational,
            partiallyOperational: partial,
            notOperational: total - operational - partial,
            overallHealth: Math.round(weightedScore)
        };
        
        return this.systemReport.summary.overallHealth;
    }

    generateRecommendations() {
        const recommendations = [];
        const nextSteps = [];
        
        // Analyze components for recommendations
        for (const [name, component] of Object.entries(this.systemReport.components)) {
            if (component.status === 'NOT_OPERATIONAL') {
                if (name === 'PWA Mobile App') {
                    recommendations.push('Deploy PWA to Firebase hosting for mobile app functionality');
                    nextSteps.push('Run PWA deployment script to enable mobile features');
                } else if (name === 'Camera Orchestrator') {
                    recommendations.push('Deploy camera orchestrator API endpoints');
                    nextSteps.push('Configure camera management service endpoints');
                }
            } else if (component.status === 'PARTIAL') {
                if (component.result && component.result.warnings) {
                    component.result.warnings.forEach(warning => {
                        if (warning.includes('Redis')) {
                            recommendations.push('Configure Redis for session management and job queuing');
                            nextSteps.push('Set up Redis instance for production scalability');
                        }
                    });
                }
            }
        }
        
        // General recommendations
        if (this.systemReport.summary.overallHealth < 80) {
            recommendations.push('Address component issues to improve system reliability');
        }
        
        if (this.systemReport.summary.overallHealth >= 80) {
            recommendations.push('System is healthy - consider load testing and monitoring setup');
            nextSteps.push('Implement monitoring dashboard and alerting');
        }
        
        this.systemReport.recommendations = recommendations;
        this.systemReport.nextSteps = nextSteps;
    }

    async generateSystemReport() {
        const reportPath = path.join(__dirname, 'comprehensive-system-report.json');
        const htmlReportPath = path.join(__dirname, 'comprehensive-system-report.html');
        
        // Generate HTML report
        const htmlReport = this.generateHTMLSystemReport();
        
        // Save reports
        fs.writeFileSync(reportPath, JSON.stringify(this.systemReport, null, 2));
        fs.writeFileSync(htmlReportPath, htmlReport);
        
        this.log('info', `System report saved: ${reportPath}`);
        this.log('info', `HTML report saved: ${htmlReportPath}`);
        
        return this.systemReport;
    }

    generateHTMLSystemReport() {
        const { components, summary, recommendations, nextSteps } = this.systemReport;
        
        const healthColor = summary.overallHealth >= 80 ? '#28a745' : 
                           summary.overallHealth >= 60 ? '#ffc107' : '#dc3545';
        
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Anava Vision System Health Report</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f8f9fa; }
        .container { max-width: 1200px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 40px; border-radius: 12px; margin-bottom: 30px; text-align: center; }
        .health-score { font-size: 64px; font-weight: bold; margin: 20px 0; color: ${healthColor}; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 20px; margin: 20px 0; }
        .component { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .component-header { padding: 20px; background: #f8f9fa; border-bottom: 1px solid #dee2e6; }
        .component-body { padding: 20px; }
        .status-operational { color: #28a745; }
        .status-partial { color: #ffc107; }
        .status-not_operational { color: #dc3545; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
        .metric { background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .recommendations { background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin: 20px 0; }
        .rec-item { background: #e3f2fd; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #2196f3; }
        .next-step { background: #f3e5f5; padding: 15px; margin: 10px 0; border-radius: 6px; border-left: 4px solid #9c27b0; }
        .json-view { background: #2d3748; color: #e2e8f0; padding: 15px; border-radius: 6px; font-family: monospace; font-size: 12px; overflow-x: auto; }
        .warning { background: #fff3cd; color: #856404; padding: 10px; border-radius: 4px; margin: 5px 0; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 Anava Vision System</h1>
            <h2>Comprehensive Health Report</h2>
            <div class="health-score">${summary.overallHealth}%</div>
            <p>Overall System Health</p>
            <p><strong>Generated:</strong> ${this.systemReport.timestamp}</p>
            <p><strong>Version:</strong> ${this.systemReport.version}</p>
        </div>
        
        <div class="metrics">
            <div class="metric">
                <h3>Operational</h3>
                <div style="font-size: 32px; font-weight: bold; color: #28a745;">${summary.operational}</div>
            </div>
            <div class="metric">
                <h3>Partial</h3>
                <div style="font-size: 32px; font-weight: bold; color: #ffc107;">${summary.partiallyOperational}</div>
            </div>
            <div class="metric">
                <h3>Down</h3>
                <div style="font-size: 32px; font-weight: bold; color: #dc3545;">${summary.notOperational}</div>
            </div>
        </div>
        
        <h2>🏗️ System Components</h2>
        <div class="grid">
            ${Object.entries(components).map(([name, component]) => `
                <div class="component">
                    <div class="component-header">
                        <h3>${component.status === 'OPERATIONAL' ? '✅' : component.status === 'PARTIAL' ? '⚠️' : '❌'} ${name}</h3>
                        <p class="status-${component.status.toLowerCase()}">${component.status}</p>
                    </div>
                    <div class="component-body">
                        <p><strong>Response Time:</strong> ${component.duration}ms</p>
                        ${component.result && component.result.warnings && component.result.warnings.length > 0 ? `
                            <div class="warning">
                                <strong>⚠️ Warnings:</strong><br>
                                ${component.result.warnings.map(w => `• ${w}`).join('<br>')}
                            </div>
                        ` : ''}
                        ${component.error ? `
                            <div style="color: #dc3545; background: #f8d7da; padding: 10px; border-radius: 4px;">
                                <strong>Error:</strong> ${component.error}
                            </div>
                        ` : ''}
                        ${component.result ? `
                            <details style="margin-top: 10px;">
                                <summary>View Details</summary>
                                <div class="json-view">${JSON.stringify(component.result, null, 2)}</div>
                            </details>
                        ` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
        
        ${recommendations.length > 0 ? `
            <div class="recommendations">
                <h2>💡 Recommendations</h2>
                ${recommendations.map(rec => `<div class="rec-item">${rec}</div>`).join('')}
                
                <h3>🎯 Next Steps</h3>
                ${nextSteps.map(step => `<div class="next-step">${step}</div>`).join('')}
            </div>
        ` : ''}
        
        <div style="margin-top: 30px; padding: 20px; background: white; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2>📊 Full System Data</h2>
            <div class="json-view">${JSON.stringify(this.systemReport, null, 2)}</div>
        </div>
    </div>
</body>
</html>`;
    }

    async runComprehensiveValidation() {
        this.log('info', '🚀 Starting comprehensive system validation');
        this.log('info', `🎯 Target environment: ${this.systemReport.environment}`);
        
        // Test all system components
        await this.testComponent('Web Deployment Service', () => this.testWebDeploymentService());
        await this.testComponent('Camera Orchestrator', () => this.testCameraOrchestrator());
        await this.testComponent('PWA Mobile App', () => this.testPWADeployment());
        await this.testComponent('System Connectivity', () => this.testSystemConnectivity());
        await this.testComponent('Infrastructure Health', () => this.testInfrastructureHealth());
        
        // Calculate overall health
        const overallHealth = this.calculateOverallHealth();
        
        // Generate recommendations
        this.generateRecommendations();
        
        // Generate final report
        const report = await this.generateSystemReport();
        
        // Final summary
        this.log('info', '🎉 Comprehensive validation completed!');
        this.log('info', `🏥 Overall Health: ${overallHealth}%`);
        this.log('info', `✅ Operational: ${this.systemReport.summary.operational}/${this.systemReport.summary.totalComponents}`);
        
        if (this.systemReport.summary.partiallyOperational > 0) {
            this.log('warning', `⚠️  ${this.systemReport.summary.partiallyOperational} component(s) partially operational`);
        }
        
        if (this.systemReport.summary.notOperational > 0) {
            this.log('warning', `❌ ${this.systemReport.summary.notOperational} component(s) not operational`);
        }
        
        this.log('info', '📄 View the HTML report for detailed analysis and recommendations');
        
        return report;
    }
}

// Run validation if script is executed directly
if (require.main === module) {
    const validator = new ComprehensiveSystemValidator();
    validator.runComprehensiveValidation().catch(error => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
}

module.exports = ComprehensiveSystemValidator;