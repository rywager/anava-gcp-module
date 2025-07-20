// Updated showSuccessResults function for dashboard.html
// Replace the existing showSuccessResults function with this one

function showSuccessResults(outputs) {
    // Store outputs for download
    deploymentOutputs = outputs;
    
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.classList.add('visible');
    
    // Check if we have the new link-based outputs
    const hasLinks = outputs.apiKeySecretLink || outputs.firebaseConfigLink || outputs.firebaseWebAppLink;
    
    // Build the appropriate content based on output type
    let mainContent = '';
    
    if (hasLinks) {
        // New link-based output display
        mainContent = `
            <div class="result-section">
                <h3 class="section-title">🔐 Configuration Resources</h3>
                <div class="results-grid">
                    ${outputs.apiKeySecretLink ? `
                    <div class="result-card">
                        <h3 class="result-label">API Key</h3>
                        <div class="result-value">
                            <a href="${outputs.apiKeySecretLink}" target="_blank" class="resource-link">
                                <span>View in Secret Manager</span>
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="margin-left: 4px;">
                                    <path d="M6 2L14 2L14 10M14 2L2 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </a>
                        </div>
                        <p class="result-description">Click to view and copy your API key from Secret Manager</p>
                    </div>
                    ` : ''}
                    
                    ${outputs.firebaseConfigLink ? `
                    <div class="result-card">
                        <h3 class="result-label">Firebase Configuration</h3>
                        <div class="result-value">
                            <a href="${outputs.firebaseConfigLink}" target="_blank" class="resource-link">
                                <span>View in Secret Manager</span>
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="margin-left: 4px;">
                                    <path d="M6 2L14 2L14 10M14 2L2 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </a>
                        </div>
                        <p class="result-description">Complete Firebase configuration JSON for your application</p>
                    </div>
                    ` : ''}
                    
                    ${outputs.firebaseWebAppLink ? `
                    <div class="result-card">
                        <h3 class="result-label">Firebase Console</h3>
                        <div class="result-value">
                            <a href="${outputs.firebaseWebAppLink}" target="_blank" class="resource-link">
                                <span>Open Firebase Console</span>
                                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="margin-left: 4px;">
                                    <path d="M6 2L14 2L14 10M14 2L2 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                </svg>
                            </a>
                        </div>
                        <p class="result-description">Set up authentication providers and create user accounts</p>
                    </div>
                    ` : ''}
                </div>
            </div>
        `;
        
        // Add additional resource links if available
        if (outputs.resourceLinks) {
            mainContent += `
                <div class="result-section">
                    <h3 class="section-title">📚 Additional Resources</h3>
                    <div class="results-grid">
                        ${outputs.resourceLinks.secretManager ? `
                        <div class="result-card">
                            <h3 class="result-label">All Secrets</h3>
                            <div class="result-value">
                                <a href="${outputs.resourceLinks.secretManager}" target="_blank" class="resource-link">
                                    <span>Secret Manager Console</span>
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="margin-left: 4px;">
                                        <path d="M6 2L14 2L14 10M14 2L2 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </a>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${outputs.resourceLinks.apiGateway ? `
                        <div class="result-card">
                            <h3 class="result-label">API Gateway</h3>
                            <div class="result-value">
                                <a href="${outputs.resourceLinks.apiGateway}" target="_blank" class="resource-link">
                                    <span>API Gateway Console</span>
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="margin-left: 4px;">
                                        <path d="M6 2L14 2L14 10M14 2L2 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </a>
                            </div>
                        </div>
                        ` : ''}
                        
                        ${outputs.resourceLinks.cloudFunctions ? `
                        <div class="result-card">
                            <h3 class="result-label">Cloud Functions</h3>
                            <div class="result-value">
                                <a href="${outputs.resourceLinks.cloudFunctions}" target="_blank" class="resource-link">
                                    <span>Functions Console</span>
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="margin-left: 4px;">
                                        <path d="M6 2L14 2L14 10M14 2L2 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                                    </svg>
                                </a>
                            </div>
                        </div>
                        ` : ''}
                    </div>
                </div>
            `;
        }
    } else {
        // Fallback to old output display (for backwards compatibility)
        mainContent = `
            ${outputs.firebaseConfig ? `
            <div class="result-section">
                <h3 class="section-title">🔥 Firebase Configuration</h3>
                <div class="results-grid">
                    <div class="result-card">
                        <h3 class="result-label">Web API Key</h3>
                        <div class="result-value">
                            <span>${outputs.firebaseConfig.apiKey || outputs.apiKey || 'Check Secret Manager'}</span>
                            <button class="copy-button" onclick="copyToClipboard('${outputs.firebaseConfig.apiKey || outputs.apiKey || ''}', this)">Copy</button>
                        </div>
                    </div>
                    <!-- Other Firebase fields... -->
                </div>
            </div>
            ` : ''}
        `;
    }
    
    // API Gateway URL section (works for both old and new format)
    let apiGatewaySection = '';
    if (outputs.apiGatewayUrl && outputs.apiGatewayUrl !== 'Not found') {
        apiGatewaySection = `
            <div class="result-section">
                <h3 class="section-title">🚀 API Gateway</h3>
                <div class="results-grid">
                    <div class="result-card" style="grid-column: 1 / -1;">
                        <h3 class="result-label">API Gateway URL</h3>
                        <div class="result-value">
                            <span>${outputs.apiGatewayUrl}</span>
                            <button class="copy-button" onclick="copyToClipboard('${outputs.apiGatewayUrl}', this)">Copy</button>
                        </div>
                        <p class="result-description">Use this URL to access your API endpoints</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Next steps section
    const nextStepsSection = hasLinks ? `
        <div class="result-section">
            <h3 class="section-title">📖 Next Steps</h3>
            <div class="quick-start-steps">
                <div class="quick-start-step">
                    <div class="quick-start-number">1</div>
                    <div class="quick-start-content">
                        <h4>Get Your Configuration</h4>
                        <p>Click the <strong>API Key</strong> and <strong>Firebase Configuration</strong> links above to retrieve your secrets from Secret Manager.</p>
                    </div>
                </div>
                
                <div class="quick-start-step">
                    <div class="quick-start-number">2</div>
                    <div class="quick-start-content">
                        <h4>Set Up Authentication</h4>
                        <p>Open the <strong>Firebase Console</strong> to enable authentication providers and create user accounts.</p>
                    </div>
                </div>
                
                <div class="quick-start-step">
                    <div class="quick-start-number">3</div>
                    <div class="quick-start-content">
                        <h4>Update Your Application</h4>
                        <p>Integrate the configuration into your ACAP application and NextJS UI.</p>
                    </div>
                </div>
            </div>
        </div>
    ` : '';
    
    resultsContainer.innerHTML = `
        <div class="success-animation">
            <svg class="success-icon" viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="25" fill="none" stroke="#10b981" stroke-width="2"/>
                <path fill="none" stroke="#10b981" stroke-width="3" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
            </svg>
            <h2 class="success-title">Deployment Successful!</h2>
            <p class="success-subtitle">Your Anava infrastructure is ready to use</p>
        </div>
        
        ${apiGatewaySection}
        ${mainContent}
        ${nextStepsSection}
        
        <div class="download-config">
            <button class="download-button" onclick="downloadConfiguration()">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 14L6 10M10 14L14 10M10 14V3M3 17H17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Download Configuration Summary
            </button>
        </div>
    `;
    
    // Update all steps to completed
    deploymentSteps.forEach(step => {
        updateStepStatus(step.id, 'completed');
    });
}

// Updated downloadConfiguration function to handle new outputs
function downloadConfiguration() {
    if (!deploymentOutputs) {
        alert('No configuration available to download');
        return;
    }
    
    // Extract project ID from various possible sources
    const projectId = deploymentOutputs.firebaseConfig?.projectId || 
                     deploymentOutputs.apiKeySecretLink?.match(/project=([^&]+)/)?.[1] ||
                     selectedProject?.id || 
                     'unknown';
    
    // Create a comprehensive config object
    const config = {
        deployment: {
            timestamp: new Date().toISOString(),
            projectId: projectId,
            region: deploymentOutputs.region || 'us-central1',
            version: '2.3.28'
        },
        resources: {
            apiGatewayUrl: deploymentOutputs.apiGatewayUrl || 'Not found',
            secretManagerLinks: {
                apiKey: deploymentOutputs.apiKeySecretLink || null,
                firebaseConfig: deploymentOutputs.firebaseConfigLink || null
            },
            consoleLinks: {
                firebaseConsole: deploymentOutputs.firebaseWebAppLink || null,
                secretManager: deploymentOutputs.resourceLinks?.secretManager || null,
                apiGateway: deploymentOutputs.resourceLinks?.apiGateway || null,
                cloudFunctions: deploymentOutputs.resourceLinks?.cloudFunctions || null
            }
        },
        instructions: {
            step1: "Visit the Secret Manager links to retrieve your API key and Firebase configuration",
            step2: "Open the Firebase Console to set up authentication and create users",
            step3: "Use the API Gateway URL in your application for API calls",
            step4: "See INTEGRATION_GUIDE.md for detailed integration instructions"
        },
        // Include raw outputs for reference
        rawOutputs: deploymentOutputs
    };
    
    // Create and download the file
    const dataStr = JSON.stringify(config, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `anava-deployment-config-${projectId}-${new Date().getTime()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

// Add CSS for resource links
const linkStyles = `
<style>
.resource-link {
    display: inline-flex;
    align-items: center;
    color: var(--primary, #3b82f6);
    text-decoration: none;
    font-weight: 500;
    transition: all 0.2s ease;
    padding: 0.5rem 1rem;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 0.375rem;
    background: var(--bg-card, #ffffff);
}

.resource-link:hover {
    background: var(--bg-hover, #f9fafb);
    border-color: var(--primary, #3b82f6);
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.resource-link svg {
    transition: transform 0.2s ease;
}

.resource-link:hover svg {
    transform: translate(2px, -2px);
}

.quick-start-step {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
}

.quick-start-number {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    background: var(--primary, #3b82f6);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
}

.quick-start-content h4 {
    margin: 0 0 0.5rem 0;
    color: var(--text-primary, #1f2937);
}

.quick-start-content p {
    margin: 0;
    color: var(--text-secondary, #6b7280);
    line-height: 1.5;
}
</style>
`;