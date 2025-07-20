# VAPIX ACAP Deployment - Explained

## Current Implementation

The ACAP deployment uses the official VAPIX Application API with these endpoints:

### 1. Upload ACAP Package
- **Endpoint**: `/axis-cgi/applications/upload.cgi`
- **Method**: POST (multipart/form-data)
- **Field Name**: `packfil` (required by Axis)
- **Auth**: Digest authentication
- **Response**: `OK package=<packagename> version=<version>`

### 2. Start Application  
- **Endpoint**: `/axis-cgi/applications/control.cgi?action=start&package=<name>`
- **Method**: GET
- **Auth**: Digest authentication
- **Response**: `OK` or error message

### 3. Other Control Actions (optional)
- **Stop**: `control.cgi?action=stop&package=<name>`
- **Remove**: `control.cgi?action=remove&package=<name>`
- **List**: `list.cgi` (to check status)

## IPC Flow

1. **Frontend** (`ACAPDeploySimple.tsx`):
   ```javascript
   window.electronAPI.deployACAP({
     cameraIp, username, password, 
     acapFile: Array.from(uint8Array),  // File as byte array
     acapFileName
   })
   ```

2. **Preload** (`preload.js`):
   ```javascript
   deployACAP: (params) => ipcRenderer.invoke('deploy-acap-vapix', params)
   ```

3. **Backend** (`vapixAcapDeploy.js`):
   - Receives byte array
   - Converts to Buffer
   - Creates multipart form
   - Handles digest auth
   - Uploads via VAPIX

## Why Direct HTTP Instead of Axios?

The new implementation uses Node.js `http` module directly because:
1. Better control over multipart/form-data streaming
2. More reliable digest authentication handling
3. Avoids FormData compatibility issues in Node.js
4. Direct pipe() support for file uploads

## Authentication Flow

1. First request without auth → 401 response with WWW-Authenticate header
2. Parse digest challenge (realm, nonce, qop)
3. Calculate digest response:
   - HA1 = MD5(username:realm:password)
   - HA2 = MD5(method:uri)
   - Response = MD5(HA1:nonce:nc:cnonce:qop:HA2)
4. Second request with Authorization header

## Common Issues & Solutions

### "No response from camera"
- Check network connectivity
- Verify camera IP is correct
- Ensure digest auth credentials are valid
- Check if camera has ACAP support enabled

### "Upload failed"
- Verify .eap file is valid
- Check camera has enough storage
- Ensure user has admin privileges
- Verify camera firmware supports the ACAP

## Testing VAPIX Manually

Test upload endpoint:
```bash
curl -X POST http://camera-ip/axis-cgi/applications/upload.cgi \
  --digest -u root:password \
  -F "packfil=@your-app.eap"
```

Test control endpoint:
```bash
curl -X GET "http://camera-ip/axis-cgi/applications/control.cgi?action=start&package=your-app" \
  --digest -u root:password
```