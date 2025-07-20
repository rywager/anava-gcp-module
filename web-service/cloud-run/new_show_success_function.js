        // Show success results - aligned with ACAP settings screen
        function showSuccessResults(outputs) {
            // Store outputs for download
            deploymentOutputs = outputs;
            
            const resultsContainer = document.getElementById('results-container');
            resultsContainer.classList.add('visible');
            
            // Extract values we need
            const projectId = outputs.firebaseConfig?.projectId || 
                             outputs.apiKeySecretLink?.match(/project=([^&]+)/)?.[1] ||
                             outputs.apiGatewayUrl?.match(/projects\/([^\/]+)/)?.[1] ||
                             'your-project-id';
            
            const region = outputs.region || 'us-central1';
            
            // Build the results display aligned with settings screen
            let mainContent = `
                <div class="result-section">
                    <h3 class="section-title">📋 Configuration Values for Your ACAP Settings</h3>
                    <p style="color: var(--text-secondary); margin-bottom: 1rem;">
                        Copy these values into your ACAP Settings screen (System Configuration)
                    </p>
                </div>
            `;
            
            // Firebase Configuration Section
            mainContent += `
                <div class="result-section">
                    <h3 class="section-title" style="background: #f3f4f6; padding: 0.5rem 1rem; border-radius: 0.5rem;">
                        🔥 Firebase Configuration
                    </h3>
                    <div class="results-grid">
            `;
            
            // Check if we have Firebase config or need to show links
            if (outputs.firebaseConfig && typeof outputs.firebaseConfig === 'object') {
                // We have the actual Firebase config
                mainContent += `
                    <div class="result-card">
                        <h3 class="result-label">Web API Key</h3>
                        <div class="result-value">
                            <span style="font-family: monospace;">${outputs.firebaseConfig.apiKey || 'Not available'}</span>
                            <button class="copy-button" onclick="copyToClipboard('${outputs.firebaseConfig.apiKey || ''}', this)">Copy</button>
                        </div>
                    </div>
                    
                    <div class="result-card">
                        <h3 class="result-label">Auth Domain</h3>
                        <div class="result-value">
                            <span style="font-family: monospace;">${outputs.firebaseConfig.authDomain || `${projectId}.firebaseapp.com`}</span>
                            <button class="copy-button" onclick="copyToClipboard('${outputs.firebaseConfig.authDomain || `${projectId}.firebaseapp.com`}', this)">Copy</button>
                        </div>
                    </div>
                    
                    <div class="result-card">
                        <h3 class="result-label">Project ID</h3>
                        <div class="result-value">
                            <span style="font-family: monospace;">${projectId}</span>
                            <button class="copy-button" onclick="copyToClipboard('${projectId}', this)">Copy</button>
                        </div>
                    </div>
                    
                    <div class="result-card">
                        <h3 class="result-label">Storage Bucket</h3>
                        <div class="result-value">
                            <span style="font-family: monospace;">${outputs.firebaseConfig.storageBucket || outputs.firebaseStorageBucket || `${projectId}.firebasestorage.app`}</span>
                            <button class="copy-button" onclick="copyToClipboard('${outputs.firebaseConfig.storageBucket || outputs.firebaseStorageBucket || `${projectId}.firebasestorage.app`}', this)">Copy</button>
                        </div>
                    </div>
                    
                    <div class="result-card">
                        <h3 class="result-label">Messaging Sender ID</h3>
                        <div class="result-value">
                            <span style="font-family: monospace;">${outputs.firebaseConfig.messagingSenderId || 'See Firebase Console'}</span>
                            <button class="copy-button" onclick="copyToClipboard('${outputs.firebaseConfig.messagingSenderId || ''}', this)">Copy</button>
                        </div>
                    </div>
                    
                    <div class="result-card">
                        <h3 class="result-label">App ID</h3>
                        <div class="result-value">
                            <span style="font-family: monospace;">${outputs.firebaseConfig.appId || outputs.firebaseWebAppId || 'See Firebase Console'}</span>
                            <button class="copy-button" onclick="copyToClipboard('${outputs.firebaseConfig.appId || outputs.firebaseWebAppId || ''}', this)">Copy</button>
                        </div>
                    </div>
                `;
            } else if (outputs.firebaseConfigLink) {
                // Show link to get Firebase config
                mainContent += `
                    <div class="result-card" style="grid-column: 1 / -1;">
                        <div class="alert-box">
                            <p>📌 <strong>Firebase configuration is stored in Secret Manager</strong></p>
                            <a href="${outputs.firebaseConfigLink}" target="_blank" class="action-link">
                                Get Firebase Config from Secret Manager →
                            </a>
                            <p style="margin-top: 0.5rem; font-size: 0.875rem;">
                                Click the link above, view the secret value, and copy the JSON configuration
                            </p>
                        </div>
                    </div>
                `;
            }
            
            // Also check if we have individual Firebase values from Terraform
            if (!outputs.firebaseConfig && outputs.apiKey) {
                mainContent += `
                    <div class="result-card">
                        <h3 class="result-label">Web API Key</h3>
                        <div class="result-value">
                            <span style="font-family: monospace;">${outputs.apiKey}</span>
                            <button class="copy-button" onclick="copyToClipboard('${outputs.apiKey}', this)">Copy</button>
                        </div>
                        <p class="result-description" style="color: #ef4444; font-size: 0.875rem;">
                            ⚠️ This is your device API key - also use as Firebase Web API Key
                        </p>
                    </div>
                `;
            }
            
            mainContent += `
                    </div>
                </div>
            `;
            
            // Google AI Configuration Section
            mainContent += `
                <div class="result-section">
                    <h3 class="section-title" style="background: #f3f4f6; padding: 0.5rem 1rem; border-radius: 0.5rem;">
                        🤖 Google AI Configuration
                    </h3>
                    <div class="results-grid">
            `;
            
            // API Key (Direct API section)
            if (outputs.apiKey && outputs.apiKey !== 'Not found') {
                mainContent += `
                    <div class="result-card">
                        <h3 class="result-label">API Key (Direct API)</h3>
                        <div class="result-value">
                            <span style="font-family: monospace;">${outputs.apiKey}</span>
                            <button class="copy-button" onclick="copyToClipboard('${outputs.apiKey}', this)">Copy</button>
                        </div>
                        <p class="result-description" style="color: #ef4444; font-size: 0.875rem;">
                            ⚠️ Note: In production, retrieve this from Secret Manager for security
                        </p>
                    </div>
                `;
            } else if (outputs.apiKeySecretLink) {
                mainContent += `
                    <div class="result-card">
                        <h3 class="result-label">API Key (Direct API)</h3>
                        <div class="result-value">
                            <a href="${outputs.apiKeySecretLink}" target="_blank" class="resource-link">
                                Get API Key from Secret Manager →
                            </a>
                        </div>
                        <p class="result-description">Click to view and copy your API key</p>
                    </div>
                `;
            }
            
            // Vertex AI (Enterprise) section
            mainContent += `
                    <div class="result-card">
                        <h3 class="result-label">API Gateway URL</h3>
                        <div class="result-value">
                            <span style="font-family: monospace;">${outputs.apiGatewayUrl || 'Not found'}</span>
                            <button class="copy-button" onclick="copyToClipboard('${outputs.apiGatewayUrl || ''}', this)">Copy</button>
                        </div>
                    </div>
                    
                    <div class="result-card">
                        <h3 class="result-label">API Gateway Key</h3>
                        <div class="result-value">
                            <span style="font-family: monospace;">${outputs.apiKey || 'Same as API Key above'}</span>
                            <button class="copy-button" onclick="copyToClipboard('${outputs.apiKey || ''}', this)">Copy</button>
                        </div>
                    </div>
                    
                    <div class="result-card">
                        <h3 class="result-label">GCP Project ID</h3>
                        <div class="result-value">
                            <span style="font-family: monospace;">${projectId}</span>
                            <button class="copy-button" onclick="copyToClipboard('${projectId}', this)">Copy</button>
                        </div>
                    </div>
                    
                    <div class="result-card">
                        <h3 class="result-label">GCP Region</h3>
                        <div class="result-value">
                            <span style="font-family: monospace;">${region}</span>
                            <button class="copy-button" onclick="copyToClipboard('${region}', this)">Copy</button>
                        </div>
                    </div>
                    
                    <div class="result-card">
                        <h3 class="result-label">GCS Bucket Name</h3>
                        <div class="result-value">
                            <span style="font-family: monospace;">${outputs.firebaseStorageBucket || `${projectId}.firebasestorage.app`}</span>
                            <button class="copy-button" onclick="copyToClipboard('${outputs.firebaseStorageBucket || `${projectId}.firebasestorage.app`}', this)">Copy</button>
                        </div>
                    </div>
                `;
            
            mainContent += `
                    </div>
                </div>
            `;
            
            // Quick Setup Guide
            mainContent += `
                <div class="result-section">
                    <h3 class="section-title">🚀 Quick Setup Guide</h3>
                    <div class="setup-instructions">
                        <div class="instruction-step">
                            <span class="step-num">1</span>
                            <div class="step-content">
                                <strong>Copy Values Above</strong>
                                <p>Use the copy buttons to get each configuration value</p>
                            </div>
                        </div>
                        
                        <div class="instruction-step">
                            <span class="step-num">2</span>
                            <div class="step-content">
                                <strong>Open ACAP Settings</strong>
                                <p>Go to System Configuration in your ACAP web interface</p>
                            </div>
                        </div>
                        
                        <div class="instruction-step">
                            <span class="step-num">3</span>
                            <div class="step-content">
                                <strong>Paste Values</strong>
                                <p>Paste each value into the corresponding field and save</p>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            // Firebase Setup Tasks
            mainContent += `
                <div class="result-section">
                    <h3 class="section-title">⚙️ Required Setup Tasks</h3>
                    <div class="setup-tasks">
                        <div class="task-item">
                            <input type="checkbox" id="task-auth" />
                            <label for="task-auth">
                                <strong>Enable Firebase Authentication</strong>
                                <a href="https://console.firebase.google.com/project/${projectId}/authentication/providers" 
                                   target="_blank" class="task-link">Open Firebase Auth →</a>
                                <span class="task-detail">Enable Email/Password authentication</span>
                            </label>
                        </div>
                        
                        <div class="task-item">
                            <input type="checkbox" id="task-users" />
                            <label for="task-users">
                                <strong>Create User Accounts</strong>
                                <a href="https://console.firebase.google.com/project/${projectId}/authentication/users" 
                                   target="_blank" class="task-link">Add Users →</a>
                                <span class="task-detail">Create accounts for team members</span>
                            </label>
                        </div>
                        
                        <div class="task-item">
                            <input type="checkbox" id="task-test" />
                            <label for="task-test">
                                <strong>Test API Connection</strong>
                                <span class="task-detail">Use curl to test: <code>curl -H "x-api-key: YOUR_KEY" ${outputs.apiGatewayUrl || 'YOUR_GATEWAY_URL'}/health</code></span>
                            </label>
                        </div>
                    </div>
                </div>
            `;
            
            // Resource Links
            if (outputs.resourceLinks || outputs.apiKeySecretLink) {
                mainContent += `
                    <div class="result-section">
                        <h3 class="section-title">🔗 Quick Links</h3>
                        <div class="quick-links">
                            ${outputs.apiKeySecretLink ? `
                            <a href="${outputs.apiKeySecretLink}" target="_blank" class="quick-link">
                                <span class="quick-link-icon">🔑</span>
                                <span>API Key Secret</span>
                            </a>
                            ` : ''}
                            ${outputs.firebaseConfigLink ? `
                            <a href="${outputs.firebaseConfigLink}" target="_blank" class="quick-link">
                                <span class="quick-link-icon">🔥</span>
                                <span>Firebase Config</span>
                            </a>
                            ` : ''}
                            ${outputs.resourceLinks?.secretManager ? `
                            <a href="${outputs.resourceLinks.secretManager}" target="_blank" class="quick-link">
                                <span class="quick-link-icon">🔐</span>
                                <span>Secret Manager</span>
                            </a>
                            ` : ''}
                            ${outputs.resourceLinks?.apiGateway ? `
                            <a href="${outputs.resourceLinks.apiGateway}" target="_blank" class="quick-link">
                                <span class="quick-link-icon">🌐</span>
                                <span>API Gateway</span>
                            </a>
                            ` : ''}
                            ${outputs.resourceLinks?.cloudFunctions ? `
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
                    <p class="success-subtitle">Copy the values below into your ACAP Settings screen</p>
                </div>
                
                ${mainContent}
                
                <div class="download-config">
                    <button class="download-button" onclick="downloadConfiguration()">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                            <path d="M10 14L6 10M10 14L14 10M10 14V3M3 17H17" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                        Download All Configuration
                    </button>
                    <p style="text-align: center; margin-top: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">
                        Save this file for future reference
                    </p>
                </div>
            `;
            
            // Update all steps to completed
            deploymentSteps.forEach(step => {
                updateStepStatus(step.id, 'completed');
            });
        }