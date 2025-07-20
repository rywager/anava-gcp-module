#!/usr/bin/env node

/**
 * Mobile PWA E2E Validation
 * Tests Progressive Web App functionality and mobile features
 */

const axios = require('axios');
const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

class MobilePWAValidator {
    constructor() {
        this.config = {
            // PWA URLs to test
            pwaUrl: process.env.PWA_URL || 'https://anava-vision-pwa.firebaseapp.com',
            fallbackPwaUrl: 'https://anava-vision-pwa.web.app',
            timeout: 30000
        };
        
        this.results = {
            timestamp: new Date().toISOString(),
            pwaUrl: null,
            tests: {},
            summary: {
                total: 0,
                passed: 0,
                failed: 0,
                warnings: 0
            },
            pwaFeatures: {},
            performance: {},
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
        this.log('info', `📱 ${testName}`);
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
                timestamp: new Date().toISOString()
            };
            
            this.results.summary.failed++;
            this.results.errors.push({
                test: testName,
                error: error.message
            });
            
            this.log('error', `❌ ${testName} failed (${duration}ms): ${error.message}`);
            return null;
        }
    }

    async findWorkingPWAUrl() {
        const urlsToTry = [this.config.pwaUrl, this.config.fallbackPwaUrl];
        
        for (const url of urlsToTry) {
            try {
                this.log('info', `🔍 Checking PWA URL: ${url}`);
                const response = await axios.get(url, {
                    timeout: 10000,
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
                    }
                });
                
                if (response.status === 200) {
                    this.log('success', `✅ Found working PWA at: ${url}`);
                    this.results.pwaUrl = url;
                    return url;
                }
            } catch (error) {
                this.log('warning', `⚠️  ${url} not accessible: ${error.message}`);
            }
        }
        
        throw new Error('No working PWA URL found');
    }

    async testPWAManifest() {
        const manifestUrl = `${this.results.pwaUrl}/manifest.json`;
        
        try {
            const response = await axios.get(manifestUrl, {
                timeout: this.config.timeout
            });
            
            if (response.status !== 200) {
                throw new Error(`Manifest failed with status: ${response.status}`);
            }
            
            const manifest = response.data;
            const warnings = [];
            
            // Check required PWA manifest fields
            const requiredFields = ['name', 'short_name', 'start_url', 'display', 'icons'];
            const missingFields = requiredFields.filter(field => !manifest[field]);
            
            if (missingFields.length > 0) {
                warnings.push(`Missing required fields: ${missingFields.join(', ')}`);
            }
            
            // Check icons
            if (manifest.icons && manifest.icons.length > 0) {
                const iconSizes = manifest.icons.map(icon => icon.sizes);
                const has192 = iconSizes.some(size => size && size.includes('192x192'));
                const has512 = iconSizes.some(size => size && size.includes('512x512'));
                
                if (!has192) warnings.push('Missing 192x192 icon');
                if (!has512) warnings.push('Missing 512x512 icon');
            } else {
                warnings.push('No icons defined');
            }
            
            return {
                available: true,
                manifest: manifest,
                iconCount: manifest.icons ? manifest.icons.length : 0,
                display: manifest.display,
                orientation: manifest.orientation,
                warnings: warnings
            };
            
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return {
                    available: false,
                    warnings: ['PWA manifest not found - app cannot be installed']
                };
            }
            throw error;
        }
    }

    async testServiceWorker() {
        const swUrl = `${this.results.pwaUrl}/service-worker.js`;
        
        try {
            const response = await axios.get(swUrl, {
                timeout: this.config.timeout
            });
            
            if (response.status !== 200) {
                throw new Error(`Service worker failed with status: ${response.status}`);
            }
            
            const swContent = response.data;
            const warnings = [];
            
            // Basic service worker checks
            if (!swContent.includes('install')) {
                warnings.push('Service worker missing install event');
            }
            
            if (!swContent.includes('fetch')) {
                warnings.push('Service worker missing fetch event (no offline support)');
            }
            
            if (!swContent.includes('cache')) {
                warnings.push('Service worker does not appear to use caching');
            }
            
            return {
                available: true,
                size: response.headers['content-length'] || swContent.length,
                hasInstallEvent: swContent.includes('install'),
                hasFetchEvent: swContent.includes('fetch'),
                hasCaching: swContent.includes('cache'),
                warnings: warnings
            };
            
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return {
                    available: false,
                    warnings: ['Service worker not found - no offline support']
                };
            }
            throw error;
        }
    }

    async testOfflineCapability() {
        // Test if the PWA provides offline functionality
        const indexResponse = await axios.get(this.results.pwaUrl, {
            timeout: this.config.timeout,
            headers: {
                'Cache-Control': 'no-cache'
            }
        });
        
        const content = indexResponse.data;
        const warnings = [];
        
        // Check for offline indicators
        const hasOfflineIndicators = [
            content.includes('service-worker'),
            content.includes('offline'),
            content.includes('cache'),
            content.includes('workbox')
        ].some(Boolean);
        
        if (!hasOfflineIndicators) {
            warnings.push('No offline functionality indicators found');
        }
        
        return {
            hasIndicators: hasOfflineIndicators,
            contentSize: content.length,
            cacheHeaders: indexResponse.headers['cache-control'],
            warnings: warnings
        };
    }

    async testMobileResponsiveness() {
        // Test with mobile user agent
        const response = await axios.get(this.results.pwaUrl, {
            timeout: this.config.timeout,
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1'
            }
        });
        
        const content = response.data;
        const warnings = [];
        
        // Check for mobile optimization
        const hasViewport = content.includes('viewport');
        const hasMediaQueries = content.includes('@media') || content.includes('responsive');
        const hasTouchIcons = content.includes('apple-touch-icon');
        
        if (!hasViewport) warnings.push('Missing viewport meta tag');
        if (!hasMediaQueries) warnings.push('No responsive design indicators found');
        if (!hasTouchIcons) warnings.push('Missing touch icons for mobile');
        
        return {
            hasViewport: hasViewport,
            hasResponsiveDesign: hasMediaQueries,
            hasTouchIcons: hasTouchIcons,
            loadTime: response.headers['x-response-time'] || 'unknown',
            warnings: warnings
        };
    }

    async testPWAInstallability() {
        // Check if the PWA meets installation criteria
        const manifestTest = await this.testPWAManifest();
        const swTest = await this.testServiceWorker();
        
        const installable = manifestTest.available && swTest.available;
        const warnings = [];
        
        if (!manifestTest.available) {
            warnings.push('Cannot install: No manifest file');
        }
        
        if (!swTest.available) {
            warnings.push('Cannot install: No service worker');
        }
        
        if (installable && manifestTest.warnings.length > 0) {
            warnings.push('Installation may have issues due to manifest warnings');
        }
        
        return {
            installable: installable,
            criteria: {
                hasManifest: manifestTest.available,
                hasServiceWorker: swTest.available,
                hasValidManifest: manifestTest.available && manifestTest.warnings.length === 0
            },
            warnings: warnings
        };
    }

    async testLoadPerformance() {
        const tests = [
            { name: 'Main App', url: this.results.pwaUrl },
            { name: 'Manifest', url: `${this.results.pwaUrl}/manifest.json` },
            { name: 'Service Worker', url: `${this.results.pwaUrl}/service-worker.js` }
        ];
        
        const results = [];
        
        for (const test of tests) {
            try {
                const startTime = performance.now();
                const response = await axios.get(test.url, {
                    timeout: this.config.timeout
                });
                const loadTime = Math.round(performance.now() - startTime);
                
                results.push({
                    name: test.name,
                    loadTime: loadTime,
                    size: response.headers['content-length'] || response.data.length,
                    status: response.status
                });
                
            } catch (error) {
                results.push({
                    name: test.name,
                    error: error.message,
                    failed: true
                });
            }
        }
        
        const avgLoadTime = Math.round(
            results.filter(r => !r.failed).reduce((sum, r) => sum + r.loadTime, 0) / 
            results.filter(r => !r.failed).length || 0
        );
        
        const warnings = avgLoadTime > 3000 ? ['Average load time exceeds 3 seconds'] : [];
        
        return {
            results: results,
            averageLoadTime: avgLoadTime,
            fastestLoad: Math.min(...results.filter(r => !r.failed).map(r => r.loadTime)),
            warnings: warnings
        };
    }

    async generatePWAReport() {
        const reportPath = path.join(__dirname, 'mobile-pwa-report.json');
        const htmlReportPath = path.join(__dirname, 'mobile-pwa-report.html');
        
        // Calculate PWA score
        this.results.pwaScore = this.calculatePWAScore();
        this.results.summary.successRate = this.results.summary.total > 0 
            ? Math.round((this.results.summary.passed / this.results.summary.total) * 100)
            : 0;
        
        // Save JSON report
        fs.writeFileSync(reportPath, JSON.stringify(this.results, null, 2));
        
        // Generate HTML report
        const htmlReport = this.generatePWAHTMLReport();
        fs.writeFileSync(htmlReportPath, htmlReport);
        
        this.log('info', `📱 PWA report saved to: ${reportPath}`);
        this.log('info', `🌐 HTML report saved to: ${htmlReportPath}`);
        
        return this.results;
    }

    calculatePWAScore() {
        const tests = this.results.tests;
        
        let score = 0;
        let maxScore = 0;
        
        // Weight different aspects
        const weights = {
            'PWA Manifest': 25,
            'Service Worker': 25,
            'Mobile Responsiveness': 20,
            'PWA Installability': 20,
            'Offline Capability': 10
        };
        
        for (const [testName, weight] of Object.entries(weights)) {
            maxScore += weight;
            if (tests[testName] && tests[testName].status === 'PASSED') {
                score += weight;
            }
        }
        
        return maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    }

    generatePWAHTMLReport() {
        const { tests, summary, pwaUrl, pwaScore } = this.results;
        
        return `
<!DOCTYPE html>
<html>
<head>
    <title>Anava Vision PWA Mobile Test Report</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 20px; background: #f8f9fa; }
        .container { max-width: 800px; margin: 0 auto; }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 20px; text-align: center; }
        .pwa-score { font-size: 48px; font-weight: bold; margin: 20px 0; color: ${pwaScore >= 80 ? '#28a745' : pwaScore >= 60 ? '#ffc107' : '#dc3545'}; }
        .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; margin: 20px 0; }
        .metric { background: white; padding: 20px; border-radius: 8px; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .test-results { background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); margin: 20px 0; }
        .test-result { padding: 20px; border-bottom: 1px solid #eee; }
        .test-result:last-child { border-bottom: none; }
        .status-passed { color: #28a745; }
        .status-failed { color: #dc3545; }
        .status-warning { color: #ffc107; }
        .warnings { background: #fff3cd; color: #856404; padding: 10px; border-radius: 4px; margin: 10px 0; }
        .json-view { background: #2d3748; color: #e2e8f0; padding: 15px; border-radius: 6px; font-family: monospace; font-size: 12px; overflow-x: auto; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📱 Anava Vision PWA</h1>
            <h2>Mobile Functionality Report</h2>
            <div class="pwa-score">${pwaScore}%</div>
            <p>PWA Readiness Score</p>
            <p><strong>App URL:</strong> ${pwaUrl}</p>
        </div>
        
        <div class="metrics">
            <div class="metric">
                <h3>Tests Passed</h3>
                <div style="font-size: 24px; font-weight: bold; color: #28a745;">${summary.passed}</div>
            </div>
            <div class="metric">
                <h3>Warnings</h3>
                <div style="font-size: 24px; font-weight: bold; color: #ffc107;">${summary.warnings}</div>
            </div>
            <div class="metric">
                <h3>Failed</h3>
                <div style="font-size: 24px; font-weight: bold; color: #dc3545;">${summary.failed}</div>
            </div>
        </div>
        
        <div class="test-results">
            <h2 style="padding: 20px 20px 0 20px; margin: 0;">📋 PWA Test Results</h2>
            ${Object.entries(tests).map(([testName, result]) => `
                <div class="test-result">
                    <h3>${result.status === 'PASSED' ? '✅' : result.status === 'WARNING' ? '⚠️' : '❌'} ${testName}</h3>
                    <p class="status-${result.status.toLowerCase()}"><strong>${result.status}</strong> (${result.duration}ms)</p>
                    ${result.result && result.result.warnings && result.result.warnings.length > 0 ? `
                        <div class="warnings">
                            ${result.result.warnings.map(w => `• ${w}`).join('<br>')}
                        </div>
                    ` : ''}
                    ${result.error ? `
                        <div style="color: #dc3545; background: #f8d7da; padding: 10px; border-radius: 4px;">
                            <strong>Error:</strong> ${result.error}
                        </div>
                    ` : ''}
                    ${result.result ? `
                        <details style="margin-top: 10px;">
                            <summary>View Details</summary>
                            <div class="json-view">${JSON.stringify(result.result, null, 2)}</div>
                        </details>
                    ` : ''}
                </div>
            `).join('')}
        </div>
    </div>
</body>
</html>`;
    }

    async runMobilePWAValidation() {
        this.log('info', '📱 Starting Mobile PWA validation');
        
        // Find working PWA URL
        await this.findWorkingPWAUrl();
        
        if (!this.results.pwaUrl) {
            this.log('error', '❌ No working PWA URL found');
            return;
        }
        
        // Run PWA-specific tests
        await this.runTest('PWA Manifest', () => this.testPWAManifest(), true);
        await this.runTest('Service Worker', () => this.testServiceWorker(), true);
        await this.runTest('Offline Capability', () => this.testOfflineCapability(), true);
        await this.runTest('Mobile Responsiveness', () => this.testMobileResponsiveness(), true);
        await this.runTest('PWA Installability', () => this.testPWAInstallability(), true);
        await this.runTest('Load Performance', () => this.testLoadPerformance(), true);
        
        // Generate report
        const report = await this.generatePWAReport();
        
        // Final summary
        this.log('info', '🎉 PWA validation completed!');
        this.log('info', `📱 PWA Score: ${report.pwaScore}%`);
        this.log('info', `✅ Tests Passed: ${report.summary.passed}/${report.summary.total}`);
        
        if (report.summary.warnings > 0) {
            this.log('warning', `⚠️  ${report.summary.warnings} test(s) completed with warnings`);
        }
        
        if (report.summary.failed > 0) {
            this.log('error', `❌ ${report.summary.failed} test(s) failed`);
        }
        
        return report;
    }
}

// Run validation if script is executed directly
if (require.main === module) {
    const validator = new MobilePWAValidator();
    validator.runMobilePWAValidation().catch(error => {
        console.error('❌ Fatal error:', error);
        process.exit(1);
    });
}

module.exports = MobilePWAValidator;