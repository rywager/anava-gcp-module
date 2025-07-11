// Complete updated dashboard functions with API key display and Firebase setup guide

function showSuccessResults(outputs) {
    // Store outputs for download
    deploymentOutputs = outputs;
    
    const resultsContainer = document.getElementById('results-container');
    resultsContainer.classList.add('visible');
    
    // Extract project ID from various sources
    const projectId = outputs.firebaseConfig?.projectId || 
                     outputs.apiKeySecretLink?.match(/project=([^&]+)/)?.[1] ||
                     outputs.apiGatewayUrl?.match(/\/\/([^-]+)-/)?.[1] ||
                     'your-project-id';
    
    // Check if we have the new link-based outputs
    const hasLinks = outputs.apiKeySecretLink || outputs.firebaseConfigLink || outputs.firebaseWebAppLink;
    
    // Build the main content
    let mainContent = '';
    
    // API Gateway URL section (if available)
    if (outputs.apiGatewayUrl && outputs.apiGatewayUrl !== 'Not found') {
        mainContent += `
            <div class="result-section">
                <h3 class="section-title">🚀 API Gateway</h3>
                <div class="results-grid">
                    <div class="result-card" style="grid-column: 1 / -1;">
                        <h3 class="result-label">API Gateway URL</h3>
                        <div class="result-value">
                            <span>${outputs.apiGatewayUrl}</span>
                            <button class="copy-button" onclick="copyToClipboard('${outputs.apiGatewayUrl}', this)">Copy</button>
                        </div>
                        <p class="result-description">Your API endpoint - use this in your ACAP application</p>
                    </div>
                </div>
            </div>
        `;
    }
    
    // Configuration section - show actual values if available, otherwise show links
    mainContent += `
        <div class="result-section">
            <h3 class="section-title">🔐 Configuration Values</h3>
            <div class="results-grid">
    `;
    
    // API Key - show value if available (temporary for easier setup)
    if (outputs.apiKey && outputs.apiKey !== 'Not found') {
        mainContent += `
            <div class="result-card">
                <h3 class="result-label">API Key</h3>
                <div class="result-value">
                    <span style="font-family: monospace; font-size: 0.875rem;">${outputs.apiKey}</span>
                    <button class="copy-button" onclick="copyToClipboard('${outputs.apiKey}', this)">Copy</button>
                </div>
                <p class="result-description" style="color: #ef4444;">
                    ⚠️ Temporary: This will be removed in future versions. 
                    ${outputs.apiKeySecretLink ? `<a href="${outputs.apiKeySecretLink}" target="_blank">View in Secret Manager</a>` : ''}
                </p>
            </div>
        `;
    } else if (outputs.apiKeySecretLink) {
        mainContent += `
            <div class="result-card">
                <h3 class="result-label">API Key</h3>
                <div class="result-value">
                    <a href="${outputs.apiKeySecretLink}" target="_blank" class="resource-link">
                        <span>Get from Secret Manager</span>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="margin-left: 4px;">
                            <path d="M6 2L14 2L14 10M14 2L2 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </a>
                </div>
                <p class="result-description">Click to view your API key in Secret Manager</p>
            </div>
        `;
    }
    
    // Firebase Config
    if (outputs.firebaseConfigLink) {
        mainContent += `
            <div class="result-card">
                <h3 class="result-label">Firebase Configuration</h3>
                <div class="result-value">
                    <a href="${outputs.firebaseConfigLink}" target="_blank" class="resource-link">
                        <span>Get from Secret Manager</span>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style="margin-left: 4px;">
                            <path d="M6 2L14 2L14 10M14 2L2 14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </a>
                </div>
                <p class="result-description">Complete Firebase config JSON for your app</p>
            </div>
        `;
    }
    
    mainContent += `
            </div>
        </div>
    `;
    
    // Firebase Setup Guide with action buttons
    mainContent += `
        <div class="result-section">
            <h3 class="section-title">🔥 Firebase Setup Guide</h3>
            <div class="firebase-setup-guide">
                <div class="setup-step">
                    <div class="step-header">
                        <span class="step-number">1</span>
                        <h4>Enable Authentication</h4>
                    </div>
                    <p>Set up user authentication for your application</p>
                    <a href="https://console.firebase.google.com/project/${projectId}/authentication/providers" 
                       target="_blank" class="action-link">
                        Go to Authentication Settings →
                    </a>
                    <ul class="step-details">
                        <li>Click "Get started" if you see it</li>
                        <li>Enable "Email/Password" provider</li>
                        <li>Save your changes</li>
                    </ul>
                </div>
                
                <div class="setup-step">
                    <div class="step-header">
                        <span class="step-number">2</span>
                        <h4>Create User Accounts</h4>
                    </div>
                    <p>Add users who can access your system</p>
                    <a href="https://console.firebase.google.com/project/${projectId}/authentication/users" 
                       target="_blank" class="action-link">
                        Go to Users Page →
                    </a>
                    <ul class="step-details">
                        <li>Click "Add user"</li>
                        <li>Enter email and password</li>
                        <li>Create accounts for your team</li>
                    </ul>
                </div>
                
                <div class="setup-step">
                    <div class="step-header">
                        <span class="step-number">3</span>
                        <h4>Get Your Configuration</h4>
                    </div>
                    <p>Retrieve your Firebase web app configuration</p>
                    <a href="${outputs.firebaseWebAppLink || `https://console.firebase.google.com/project/${projectId}/settings/general/`}" 
                       target="_blank" class="action-link">
                        Go to Project Settings →
                    </a>
                    <ul class="step-details">
                        <li>Scroll to "Your apps" section</li>
                        <li>Find your web app</li>
                        <li>Copy the Firebase configuration</li>
                    </ul>
                </div>
            </div>
        </div>
    `;
    
    // Quick Links section
    if (outputs.resourceLinks) {
        mainContent += `
            <div class="result-section">
                <h3 class="section-title">🔗 Quick Links</h3>
                <div class="quick-links">
                    ${outputs.resourceLinks.secretManager ? `
                    <a href="${outputs.resourceLinks.secretManager}" target="_blank" class="quick-link">
                        <span class="quick-link-icon">🔐</span>
                        <span>Secret Manager</span>
                    </a>
                    ` : ''}
                    ${outputs.resourceLinks.apiGateway ? `
                    <a href="${outputs.resourceLinks.apiGateway}" target="_blank" class="quick-link">
                        <span class="quick-link-icon">🌐</span>
                        <span>API Gateway</span>
                    </a>
                    ` : ''}
                    ${outputs.resourceLinks.cloudFunctions ? `
                    <a href="${outputs.resourceLinks.cloudFunctions}" target="_blank" class="quick-link">
                        <span class="quick-link-icon">⚡</span>
                        <span>Cloud Functions</span>
                    </a>
                    ` : ''}
                    <a href="https://console.cloud.google.com/home/dashboard?project=${projectId}" target="_blank" class="quick-link">
                        <span class="quick-link-icon">📊</span>
                        <span>Project Dashboard</span>
                    </a>
                </div>
            </div>
        `;
    }
    
    resultsContainer.innerHTML = `
        <div class="success-animation">
            <svg class="success-icon" viewBox="0 0 52 52">
                <circle cx="26" cy="26" r="25" fill="none" stroke="#10b981" stroke-width="2"/>
                <path fill="none" stroke="#10b981" stroke-width="3" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
            </svg>
            <h2 class="success-title">Deployment Successful!</h2>
            <p class="success-subtitle">Your Anava infrastructure is ready - follow the setup guide below</p>
        </div>
        
        ${mainContent}
        
        <div class="download-config">
            <button class="download-button" onclick="downloadConfiguration()">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M10 14L6 10M10 14L14 10M10 14V3M3 17H17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Download Complete Configuration
            </button>
            <p style="text-align: center; margin-top: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">
                Includes all values and links for easy reference
            </p>
        </div>
    `;
    
    // Update all steps to completed
    deploymentSteps.forEach(step => {
        updateStepStatus(step.id, 'completed');
    });
}

// Updated download function with raw API key included
function downloadConfiguration() {
    if (!deploymentOutputs) {
        alert('No configuration available to download');
        return;
    }
    
    const projectId = deploymentOutputs.firebaseConfig?.projectId || 
                     deploymentOutputs.apiKeySecretLink?.match(/project=([^&]+)/)?.[1] ||
                     deploymentOutputs.apiGatewayUrl?.match(/\/\/([^-]+)-/)?.[1] ||
                     'unknown';
    
    // Create a comprehensive config object
    const config = {
        deployment: {
            timestamp: new Date().toISOString(),
            projectId: projectId,
            region: deploymentOutputs.region || 'us-central1',
            deploymentVersion: '2.3.28'
        },
        
        // IMPORTANT CONFIGURATION VALUES
        configuration: {
            apiGatewayUrl: deploymentOutputs.apiGatewayUrl || 'Not found',
            apiKey: deploymentOutputs.apiKey || 'See Secret Manager link below',  // Include raw key if available
            // Note: In future versions, apiKey will only be available via Secret Manager for security
        },
        
        // Secret Manager Links
        secretManagerLinks: {
            apiKey: deploymentOutputs.apiKeySecretLink || null,
            firebaseConfig: deploymentOutputs.firebaseConfigLink || null,
            retrievalCommand: `gcloud secrets versions access latest --secret=${projectId}-api-key --project=${projectId}`
        },
        
        // Console Links
        consoleLinks: {
            firebaseConsole: deploymentOutputs.firebaseWebAppLink || `https://console.firebase.google.com/project/${projectId}/settings/general/`,
            firebaseAuth: `https://console.firebase.google.com/project/${projectId}/authentication/providers`,
            firebaseUsers: `https://console.firebase.google.com/project/${projectId}/authentication/users`,
            secretManager: deploymentOutputs.resourceLinks?.secretManager || `https://console.cloud.google.com/security/secret-manager?project=${projectId}`,
            apiGateway: deploymentOutputs.resourceLinks?.apiGateway || `https://console.cloud.google.com/api-gateway?project=${projectId}`,
            cloudFunctions: deploymentOutputs.resourceLinks?.cloudFunctions || `https://console.cloud.google.com/functions?project=${projectId}`
        },
        
        // Setup Instructions
        setupInstructions: {
            step1_authentication: {
                description: "Enable Firebase Authentication",
                link: `https://console.firebase.google.com/project/${projectId}/authentication/providers`,
                actions: [
                    "Click 'Get started' if this is your first time",
                    "Enable 'Email/Password' authentication",
                    "Save your changes"
                ]
            },
            step2_users: {
                description: "Create User Accounts",
                link: `https://console.firebase.google.com/project/${projectId}/authentication/users`,
                actions: [
                    "Click 'Add user'",
                    "Enter email and password for each team member",
                    "Save the credentials securely"
                ]
            },
            step3_integration: {
                description: "Integrate with your ACAP",
                actions: [
                    "Use the apiGatewayUrl in your ACAP configuration",
                    "Use the apiKey for device authentication",
                    "Configure Firebase in your NextJS UI for user auth"
                ]
            }
        },
        
        // Include raw outputs for debugging
        _rawOutputs: deploymentOutputs
    };
    
    // Create and download the file
    const dataStr = JSON.stringify(config, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    
    const exportFileDefaultName = `anava-deployment-${projectId}-${new Date().getTime()}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
}

// Additional CSS for the new elements
const additionalStyles = `
<style>
.firebase-setup-guide {
    display: grid;
    gap: 1.5rem;
}

.setup-step {
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 0.75rem;
    padding: 1.5rem;
    transition: all 0.2s ease;
}

.setup-step:hover {
    border-color: var(--primary, #3b82f6);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.step-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 0.75rem;
}

.step-number {
    width: 32px;
    height: 32px;
    background: var(--primary, #3b82f6);
    color: white;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    flex-shrink: 0;
}

.step-header h4 {
    margin: 0;
    color: var(--text-primary, #1f2937);
}

.setup-step p {
    color: var(--text-secondary, #6b7280);
    margin: 0 0 1rem 0;
}

.action-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--primary, #3b82f6);
    text-decoration: none;
    font-weight: 500;
    padding: 0.75rem 1.25rem;
    border: 2px solid var(--primary, #3b82f6);
    border-radius: 0.5rem;
    transition: all 0.2s ease;
    margin-bottom: 1rem;
}

.action-link:hover {
    background: var(--primary, #3b82f6);
    color: white;
    transform: translateY(-1px);
}

.step-details {
    margin: 1rem 0 0 0;
    padding-left: 1.5rem;
    color: var(--text-secondary, #6b7280);
    font-size: 0.875rem;
}

.step-details li {
    margin: 0.25rem 0;
}

.quick-links {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
}

.quick-link {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    background: var(--bg-card, #ffffff);
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 0.5rem;
    text-decoration: none;
    color: var(--text-primary, #1f2937);
    transition: all 0.2s ease;
}

.quick-link:hover {
    border-color: var(--primary, #3b82f6);
    transform: translateY(-2px);
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.quick-link-icon {
    font-size: 1.5rem;
}

.resource-link {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--primary, #3b82f6);
    text-decoration: none;
    font-weight: 500;
    padding: 0.5rem 1rem;
    border: 1px solid var(--border, #e5e7eb);
    border-radius: 0.375rem;
    background: var(--bg-card, #ffffff);
    transition: all 0.2s ease;
}

.resource-link:hover {
    background: var(--bg-hover, #f9fafb);
    border-color: var(--primary, #3b82f6);
    transform: translateY(-1px);
}
</style>
`;