# Architecture Detection for ACAP Deployment

## Feature Summary
Enhanced the ACAP deployment to detect camera architecture via VAPIX and show appropriate build options for each release.

## What's New

### 1. Automatic Architecture Detection
The camera discovery service now fetches:
- **Architecture**: aarch64, armv7hf, etc. via `/axis-cgi/param.cgi?action=list&group=Properties.System.Architecture`
- **Firmware Version**: via `/axis-cgi/param.cgi?action=list&group=Properties.Firmware`
- Falls back to `/axis-cgi/basicdeviceinfo.cgi` if needed

### 2. Build Selection UI
- Shows all available builds for selected release (e.g., aarch64.eap, armv7hf.eap)
- Displays architecture and OS information for each build
- Shows file sizes for each variant

### 3. Smart Build Selection
When deploying to a camera:
- **Auto-selection**: If camera architecture is detected, automatically selects matching build
- **Manual selection**: If architecture unknown or multiple options, shows dialog
- **Recommended builds**: Highlights the recommended build based on detected architecture

## UI Updates

### Release Selection
Now shows all available builds:
```
Available builds:
- aarch64 (axis) - anava-acap_1.0.0_aarch64.eap (2.5 MB)
- armv7hf (axis) - anava-acap_1.0.0_armv7hf.eap (2.3 MB)
```

### Camera List
Shows detected architecture:
```
192.168.1.100
Axis Communications P3245-LVE
Architecture: aarch64 | Firmware: 10.12.186
```

### Build Selection Dialog
When manual selection needed:
- Shows all available builds
- Highlights "Recommended" tag for matching architecture
- Displays full build details (arch, OS, size)

## VAPIX Endpoints Used

1. **Architecture Detection**:
   ```
   /axis-cgi/param.cgi?action=list&group=Properties.System.Architecture
   ```

2. **Firmware Version**:
   ```
   /axis-cgi/param.cgi?action=list&group=Properties.Firmware
   ```

3. **Fallback**:
   ```
   /axis-cgi/basicdeviceinfo.cgi
   ```

## Example Asset Name Parsing
The system parses GitHub release assets like:
- `anava-acap_1.0.0_aarch64.eap` → Architecture: aarch64
- `anava-acap_1.0.0_armv7hf.eap` → Architecture: armv7hf
- Can also detect OS variants if included in filename

## Testing
1. Discover cameras - architecture will be auto-detected
2. Select a release - all build variants will be shown
3. Deploy to camera:
   - With detected arch: Auto-selects correct build
   - Without detected arch: Shows selection dialog

## Future Enhancements
- Cache architecture info per camera
- Support more detailed OS detection
- Add architecture filtering in camera list
- Batch deployment with automatic build selection