        // Updated downloadConfiguration function with all values and links
        function downloadConfiguration() {
            if (!deploymentOutputs) {
                alert('No configuration available to download');
                return;
            }
            
            // Extract project ID from various sources
            const projectId = deploymentOutputs.firebaseConfig?.projectId || 
                             deploymentOutputs.apiKeySecretLink?.match(/project=([^&]+)/)?.[1] ||
                             deploymentOutputs.apiGatewayUrl?.match(/projects\/([^\/]+)/)?.[1] ||
                             selectedProject?.id ||
                             'unknown';
            
            // Create a comprehensive config object
            const config = {
                deployment: {
                    timestamp: new Date().toISOString(),
                    projectId: projectId,
                    region: deploymentOutputs.region || 'us-central1',
                    deploymentVersion: '2.3.29'
                },
                
                // Values for ACAP Settings Screen
                acapConfiguration: {
                    // Firebase Configuration Section
                    firebase: {
                        webApiKey: deploymentOutputs.firebaseConfig?.apiKey || deploymentOutputs.apiKey || 'Get from Secret Manager',
                        authDomain: deploymentOutputs.firebaseConfig?.authDomain || `${projectId}.firebaseapp.com`,
                        projectId: projectId,
                        storageBucket: deploymentOutputs.firebaseConfig?.storageBucket || deploymentOutputs.firebaseStorageBucket || `${projectId}.firebasestorage.app`,
                        messagingSenderId: deploymentOutputs.firebaseConfig?.messagingSenderId || 'Get from Firebase Console',
                        appId: deploymentOutputs.firebaseConfig?.appId || deploymentOutputs.firebaseWebAppId || 'Get from Firebase Console',
                        databaseURL: deploymentOutputs.firebaseConfig?.databaseURL || `https://${projectId}.firebaseio.com`
                    },
                    
                    // Google AI Configuration Section
                    googleAI: {
                        // Direct API
                        apiKey: deploymentOutputs.apiKey || 'Get from Secret Manager',
                        
                        // Vertex AI (Enterprise)
                        apiGatewayUrl: deploymentOutputs.apiGatewayUrl || 'Not found',
                        apiGatewayKey: deploymentOutputs.apiKey || 'Same as API Key',
                        gcpProjectId: projectId,
                        gcpRegion: deploymentOutputs.region || 'us-central1',
                        gcsBucketName: deploymentOutputs.firebaseStorageBucket || `${projectId}.firebasestorage.app`
                    }
                },
                
                // Secret Manager Links
                secretManagerLinks: {
                    apiKey: deploymentOutputs.apiKeySecretLink || null,
                    firebaseConfig: deploymentOutputs.firebaseConfigLink || null,
                    commands: {
                        getApiKey: `gcloud secrets versions access latest --secret=${projectId}-api-key --project=${projectId}`,
                        getFirebaseConfig: `gcloud secrets versions access latest --secret=${projectId}-firebase-config --project=${projectId}`
                    }
                },
                
                // Console Links for Setup
                setupLinks: {
                    firebaseConsole: deploymentOutputs.firebaseWebAppLink || `https://console.firebase.google.com/project/${projectId}/settings/general/`,
                    enableAuth: `https://console.firebase.google.com/project/${projectId}/authentication/providers`,
                    createUsers: `https://console.firebase.google.com/project/${projectId}/authentication/users`,
                    secretManager: deploymentOutputs.resourceLinks?.secretManager || `https://console.cloud.google.com/security/secret-manager?project=${projectId}`,
                    apiGateway: deploymentOutputs.resourceLinks?.apiGateway || `https://console.cloud.google.com/api-gateway?project=${projectId}`,
                    cloudFunctions: deploymentOutputs.resourceLinks?.cloudFunctions || `https://console.cloud.google.com/functions?project=${projectId}`,
                    projectDashboard: `https://console.cloud.google.com/home/dashboard?project=${projectId}`
                },
                
                // Setup Instructions
                setupInstructions: {
                    step1: "Copy the values from 'acapConfiguration' section into your ACAP Settings screen",
                    step2: "Go to Firebase Console and enable Email/Password authentication",
                    step3: "Create user accounts in Firebase for your team members",
                    step4: "Test the API connection with: curl -H \"x-api-key: YOUR_KEY\" YOUR_GATEWAY_URL/health",
                    step5: "Update your NextJS UI to use Firebase authentication"
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