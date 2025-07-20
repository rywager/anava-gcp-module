# ACAP Integration Summary

## Current State (Manual Configuration)
Your ACAP (batonDescribe) currently requires manual entry of:
- API Gateway URL
- API Key
- Firebase configuration
- Other settings

Users must copy/paste these values into the System Config page.

## New State (Cloud-Based Configuration)
With the deployed infrastructure:

### 1. Configuration Storage
- **API Key**: Stored in Google Secret Manager as `{prefix}-api-key`
- **Firebase Config**: Stored in Secret Manager as `{prefix}-firebase-config`
- **API Gateway URL**: Available from deployment outputs

### 2. User Authentication Flow
```
User → NextJS Login Page → Firebase Auth → ID Token → API Gateway → Cloud Functions
```

### 3. Device Configuration Options

#### Option A: Dynamic Fetching (Recommended)
```javascript
// ACAP fetches config at runtime
async function getConfiguration() {
  // Use workload identity or service account to fetch from Secret Manager
  const config = await secretManager.getSecrets();
  return {
    apiKey: config.apiKey,
    apiGatewayUrl: config.apiGatewayUrl,
    firebaseConfig: JSON.parse(config.firebaseConfig)
  };
}
```

#### Option B: Build-Time Injection
```dockerfile
# During ACAP build
ARG API_KEY
ARG FIREBASE_CONFIG
ENV ANAVA_API_KEY=$API_KEY
ENV ANAVA_FIREBASE_CONFIG=$FIREBASE_CONFIG
```

#### Option C: Configuration Service
```javascript
// ACAP queries a configuration endpoint
const response = await fetch('https://config.anava.ai/device-config', {
  headers: { 'X-Device-Id': deviceId }
});
const config = await response.json();
```

## Quick Start Implementation

### 1. Update NextJS UI
```javascript
// Add login page with Firebase Auth
import { signInWithEmailAndPassword } from 'firebase/auth';

// Protect routes requiring authentication
<ProtectedRoute>
  <LiveEventsPage />
</ProtectedRoute>
```

### 2. Update ACAP
```javascript
// Replace manual config with cloud fetch
const config = await cloudConfig.fetch();
initializeServices(config);
```

### 3. Set Up Users
1. Go to Firebase Console (use the link from deployment)
2. Enable Email/Password auth
3. Create user accounts
4. Share credentials with your team

## Benefits
- **No manual configuration** - Everything is automated
- **Centralized management** - Update config in one place
- **Better security** - Credentials in Secret Manager
- **User authentication** - Control who accesses the system
- **Scalable** - Works for 1 or 1000 devices

## Migration Timeline
1. **Week 1**: Test cloud configuration with one device
2. **Week 2**: Update NextJS UI with authentication
3. **Week 3**: Roll out to pilot devices
4. **Week 4**: Full deployment

## Key Links After Deployment
- **API Key**: Click the Secret Manager link → View secret value
- **Firebase Config**: Click the Secret Manager link → View JSON
- **Firebase Console**: Set up authentication and users
- **API Gateway**: View your deployed APIs

The deployment gives you all the infrastructure - you just need to update your ACAP and UI to use it!