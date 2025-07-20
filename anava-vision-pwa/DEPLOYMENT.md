# Anava Vision PWA - Deployment Guide

## 🚀 Quick Deploy

```bash
# Run the automated deployment script
./deploy.sh
```

## 📋 Manual Deployment Steps

### 1. Build the Application

```bash
npm install
npm run build
```

### 2. Deploy to Static Hosting

#### Netlify
```bash
npm install -g netlify-cli
netlify deploy --prod --dir=build
```

#### Vercel
```bash
npm install -g vercel
vercel --prod build
```

#### Firebase Hosting
```bash
npm install -g firebase-tools
firebase init hosting
firebase deploy --only hosting
```

#### AWS S3 + CloudFront
```bash
aws s3 sync build/ s3://your-bucket-name --delete
aws cloudfront create-invalidation --distribution-id YOUR_DIST_ID --paths "/*"
```

### 3. Docker Deployment

```bash
# Build Docker image
docker build -t anava-vision-pwa:1.0.0 .

# Run container
docker run -p 8080:80 anava-vision-pwa:1.0.0

# Access at http://localhost:8080
```

### 4. Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: anava-vision-pwa
spec:
  replicas: 3
  selector:
    matchLabels:
      app: anava-vision-pwa
  template:
    metadata:
      labels:
        app: anava-vision-pwa
    spec:
      containers:
      - name: app
        image: anava-vision-pwa:1.0.0
        ports:
        - containerPort: 80
---
apiVersion: v1
kind: Service
metadata:
  name: anava-vision-pwa-service
spec:
  selector:
    app: anava-vision-pwa
  ports:
  - port: 80
    targetPort: 80
  type: LoadBalancer
```

## 🔧 Environment Configuration

### Required Environment Variables

```bash
# Orchestrator API endpoint
REACT_APP_ORCHESTRATOR_URL=https://your-api.example.com/api

# Feature flags
REACT_APP_ENABLE_DEMO_MODE=false
REACT_APP_ENABLE_NOTIFICATIONS=true
REACT_APP_ENABLE_PWA_FEATURES=true
```

### Production Environment

```bash
# Build optimization
GENERATE_SOURCEMAP=false
REACT_APP_CACHE_DURATION=86400000

# Analytics (optional)
REACT_APP_GA_TRACKING_ID=UA-XXXXXXXXX-X
```

## 🔒 Security Considerations

### HTTPS Requirements
- PWA features require HTTPS in production
- Service workers only work over HTTPS
- Push notifications require secure context

### Content Security Policy
```nginx
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss: https:; font-src 'self'";
```

### CORS Configuration
Ensure your camera orchestrator API allows requests from your PWA domain:

```javascript
// Express.js example
app.use(cors({
  origin: ['https://your-pwa-domain.com'],
  credentials: true
}));
```

## 📱 PWA Validation

### Lighthouse Audit
```bash
npm install -g lighthouse
lighthouse https://your-domain.com --only-categories=pwa
```

### PWA Checklist
- ✅ HTTPS served
- ✅ Service worker registered
- ✅ Web app manifest
- ✅ App shell cached
- ✅ Offline functionality
- ✅ Install prompt
- ✅ Splash screen
- ✅ Theme color
- ✅ Icons (192x192, 512x512)

## 🔄 CI/CD Pipeline

### GitHub Actions Example

```yaml
name: Deploy PWA
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test -- --coverage --watchAll=false
    
    - name: Build application
      run: npm run build
    
    - name: Deploy to Netlify
      uses: nwtgck/actions-netlify@v1.2
      with:
        publish-dir: './build'
      env:
        NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
        NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
```

## 🔍 Monitoring & Analytics

### Performance Monitoring
```javascript
// web-vitals reporting
import { reportWebVitals } from './reportWebVitals';
reportWebVitals(console.log);
```

### Error Tracking
```javascript
// Sentry integration example
import * as Sentry from "@sentry/react";

Sentry.init({
  dsn: "YOUR_SENTRY_DSN",
  environment: process.env.NODE_ENV
});
```

## 🐛 Troubleshooting

### Common Issues

#### Service Worker Not Updating
- Clear browser cache
- Check service worker registration
- Verify HTTPS configuration

#### Install Prompt Not Showing
- Verify manifest.json is accessible
- Check PWA criteria in DevTools
- Ensure HTTPS is enabled

#### Push Notifications Not Working
- Verify notification permissions
- Check service worker registration
- Ensure HTTPS context

#### Camera Connection Issues
- Verify CORS configuration
- Check WebRTC browser support
- Validate orchestrator API endpoints

### Debug Commands
```bash
# Check PWA status
lighthouse --only-categories=pwa https://your-domain.com

# Test service worker
npm run build && npm run serve

# Check manifest
curl https://your-domain.com/manifest.json

# Validate HTTPS
curl -I https://your-domain.com
```

## 📞 Support

For deployment issues:
1. Check browser console for errors
2. Verify network connectivity
3. Review server logs
4. Test on different devices/browsers

For technical support, contact the development team.