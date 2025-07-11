# Anava Cloud Infrastructure Integration Guide

## Overview

This guide explains how to integrate the deployed Google Cloud infrastructure with your ACAP application (batonDescribe) and transition from manual configuration to automated cloud-based configuration.

## What Gets Deployed

When you run the Anava deployment service, it creates:

1. **API Gateway** - Provides secure API endpoints for your devices
2. **Cloud Functions** - Device authentication and token vending services
3. **Firebase Project** - Authentication and real-time database
4. **Secret Manager** - Stores API keys and configuration securely
5. **Service Accounts** - For secure service-to-service communication
6. **Storage Buckets** - For file storage and function deployment

## Accessing Your Configuration

After deployment, you'll receive links to access your configuration:

### 1. API Key (Secret Manager)
- Link: `https://console.cloud.google.com/security/secret-manager/secret/{prefix}-api-key`
- Click the link → View secret value → Copy the API key
- This is your device API key for authenticating ACAP apps

### 2. Firebase Configuration (Secret Manager)
- Link: `https://console.cloud.google.com/security/secret-manager/secret/{prefix}-firebase-config`
- Click the link → View secret value → Copy the JSON configuration
- Contains: apiKey, authDomain, projectId, storageBucket, appId

### 3. Firebase Web App (Firebase Console)
- Link: `https://console.firebase.google.com/project/{project-id}/settings/general/`
- Access your Firebase project settings
- Set up authentication providers
- Create user accounts

## Integration Steps

### Step 1: Set Up Firebase Authentication

1. Go to the Firebase Console using the provided link
2. Navigate to **Authentication** → **Sign-in method**
3. Enable **Email/Password** authentication
4. Navigate to **Authentication** → **Users**
5. Click **Add user** to create user accounts for your team

### Step 2: Update Your ACAP Application Configuration

Instead of manual entry in the System Config page, your ACAP should now:

1. **Fetch Configuration from Secret Manager**
   ```javascript
   // Example: Fetching configuration at runtime
   const { SecretManagerServiceClient } = require('@google-cloud/secret-manager');
   const client = new SecretManagerServiceClient();
   
   async function getConfig() {
     const [apiKeyVersion] = await client.accessSecretVersion({
       name: 'projects/PROJECT_ID/secrets/anava-api-key/versions/latest',
     });
     const apiKey = apiKeyVersion.payload.data.toString();
     
     const [firebaseVersion] = await client.accessSecretVersion({
       name: 'projects/PROJECT_ID/secrets/anava-firebase-config/versions/latest',
     });
     const firebaseConfig = JSON.parse(firebaseVersion.payload.data.toString());
     
     return { apiKey, firebaseConfig };
   }
   ```

2. **Or Use Environment Variables**
   Set these during ACAP deployment:
   ```bash
   ANAVA_API_KEY=<from-secret-manager>
   ANAVA_FIREBASE_CONFIG=<from-secret-manager>
   ANAVA_API_GATEWAY_URL=<from-deployment>
   ```

### Step 3: Update NextJS UI for Firebase Auth

Your NextJS frontend should now:

1. **Add Firebase Authentication**
   ```javascript
   // firebase.js
   import { initializeApp } from 'firebase/app';
   import { getAuth } from 'firebase/auth';
   
   // This config comes from your deployed infrastructure
   const firebaseConfig = {
     apiKey: "...",
     authDomain: "...",
     projectId: "...",
     storageBucket: "...",
     appId: "..."
   };
   
   const app = initializeApp(firebaseConfig);
   export const auth = getAuth(app);
   ```

2. **Create Login Page**
   ```javascript
   // pages/login.js
   import { signInWithEmailAndPassword } from 'firebase/auth';
   import { auth } from '../firebase';
   
   const handleLogin = async (email, password) => {
     try {
       await signInWithEmailAndPassword(auth, email, password);
       // Redirect to live events page
       router.push('/live-events');
     } catch (error) {
       console.error('Login failed:', error);
     }
   };
   ```

3. **Protect Routes**
   ```javascript
   // components/ProtectedRoute.js
   import { useAuthState } from 'react-firebase-hooks/auth';
   import { auth } from '../firebase';
   
   export function ProtectedRoute({ children }) {
     const [user, loading] = useAuthState(auth);
     
     if (loading) return <div>Loading...</div>;
     if (!user) return <Redirect to="/login" />;
     
     return children;
   }
   ```

### Step 4: ACAP Device Configuration

Instead of manual configuration, the ACAP can:

1. **Option 1: Build-time Configuration**
   - Include configuration during ACAP build
   - Store encrypted in the package

2. **Option 2: First-boot Configuration**
   - ACAP fetches configuration on first boot
   - Requires device to have internet access
   - Store locally after first fetch

3. **Option 3: Central Management**
   - Use a device management system
   - Push configuration to devices
   - Update configuration remotely

## Authentication Flow

1. **User Login**
   - User enters credentials in NextJS UI
   - Firebase authenticates the user
   - User receives Firebase ID token

2. **API Access**
   - UI includes Firebase ID token in API requests
   - API Gateway validates the token
   - Cloud Functions process the request

3. **Device Authentication**
   - ACAP uses API key for device authentication
   - Device Auth function validates and issues tokens
   - Token Vending Machine provides temporary credentials

## Security Best Practices

1. **Never hardcode credentials** in your ACAP source code
2. **Use Secret Manager** for all sensitive configuration
3. **Rotate API keys** periodically
4. **Implement proper RBAC** in Firebase
5. **Use HTTPS** for all communications
6. **Validate tokens** on every API request

## Migration Path

To transition from manual configuration:

1. **Phase 1: Dual Support**
   - Support both manual and cloud configuration
   - Check for cloud config first, fall back to manual

2. **Phase 2: Cloud Primary**
   - Make cloud configuration the default
   - Provide migration tool for existing deployments

3. **Phase 3: Cloud Only**
   - Remove manual configuration support
   - All devices use cloud configuration

## Troubleshooting

### Can't access secrets
- Check IAM permissions for your Google account
- Ensure you're logged into the correct Google account
- Verify the project ID matches

### Firebase auth not working
- Check Firebase authentication is enabled
- Verify user accounts are created
- Check Firebase config is correct

### API Gateway returns 403
- Verify API key is correct
- Check API Gateway configuration
- Ensure Cloud Functions are deployed

## Next Steps

1. Access your deployed resources using the provided links
2. Set up Firebase authentication and create users
3. Update your ACAP to use cloud configuration
4. Add Firebase auth to your NextJS UI
5. Test the complete flow end-to-end