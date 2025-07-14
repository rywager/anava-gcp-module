# Deployment Guide

This guide walks through deploying the Anava Camera Manager in conjunction with the terraform-installer for a complete end-to-end solution.

## Prerequisites

1. **Infrastructure Deployed**
   - Run terraform-installer to create cloud infrastructure
   - Ensure outputs.json is generated
   - Verify cloud services are running

2. **Network Access**
   - Axis cameras accessible on local network
   - Default credentials available (typically root:pass)
   - Network scanning permissions

3. **Development Environment**
   - Node.js 16+ installed
   - npm or yarn package manager
   - Git for cloning repositories

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Configure Terraform Integration**
   ```bash
   # Copy terraform outputs to the expected location
   cp ../outputs.json ./outputs.json
   
   # Or set environment variable
   export TERRAFORM_OUTPUTS_PATH="/path/to/outputs.json"
   ```

3. **Test Camera Connectivity**
   ```bash
   node test-discovery.js
   ```

4. **Start Application**
   ```bash
   ./start.sh
   ```

## Detailed Setup

### 1. Infrastructure Deployment

First, ensure your cloud infrastructure is deployed:

```bash
cd ../terraform-installer
terraform init
terraform plan
terraform apply

# Export outputs for camera manager
terraform output -json > ../anava-camera-manager/outputs.json
```

### 2. Camera Network Configuration

Ensure cameras are accessible:

```bash
# Test camera connectivity
ping 192.168.50.156

# Test VAPIX access
curl -u root:pass http://192.168.50.156/axis-cgi/basicdeviceinfo.cgi
```

### 3. Application Configuration

The application uses this priority for configuration:

1. **Terraform Outputs** (`outputs.json`)
2. **Environment Variables**
3. **Cloud API** (with deployment ID)
4. **Default Configuration** (for development)

#### Environment Variables

```bash
export DEPLOYMENT_ID="your-deployment-id"
export TERRAFORM_OUTPUTS_PATH="/path/to/outputs.json"
export NODE_ENV="production"
```

### 4. Building and Running

#### Development Mode
```bash
# Start with hot reload
npm run dev

# In another terminal
npm run electron
```

#### Production Mode
```bash
# Build optimized version
npm run build

# Start application
npm start
```

## Usage Workflow

### 1. Camera Discovery

1. Launch the application
2. Click "Refresh Cameras" to scan network
3. Review discovered cameras in the list view
4. Use topology view for visual network layout

### 2. ACAP Deployment

1. Select cameras for deployment (checkboxes)
2. Verify cloud configuration is loaded (green status)
3. Click "Deploy ACAP" button
4. Monitor progress in real-time
5. Check for successful completion

### 3. Chat Interface

1. Select a deployed camera from the list
2. Switch to "Chat Interface" tab
3. Wait for WebSocket connection
4. Start asking questions:
   - "What do you see?"
   - "Is anyone in the frame?"
   - "Create a skill to monitor this area"

## Troubleshooting

### Camera Discovery Issues

**No cameras found:**
- Check network connectivity
- Verify subnet ranges in `cameraDiscovery.ts`
- Ensure cameras have default credentials
- Check firewall settings

**Authentication failures:**
- Verify camera credentials
- Check if cameras have been reconfigured
- Try factory reset if needed

### Deployment Issues

**ACAP upload fails:**
- Check camera disk space
- Verify ACAP file integrity
- Ensure camera firmware compatibility
- Review VAPIX logs

**Configuration errors:**
- Verify terraform outputs are correct
- Check cloud service endpoints
- Validate certificate authority
- Test network connectivity to cloud

### Chat Interface Issues

**WebSocket connection fails:**
- Verify MCP server is running
- Check WebSocket URL in configuration
- Review network firewall rules
- Test direct connection to MCP server

**No responses from camera:**
- Ensure ACAP is deployed and running
- Check camera logs for errors
- Verify MCP integration is working
- Test camera VAPIX connectivity

## Integration with Terraform-Installer

### Expected Outputs

The camera manager expects these terraform outputs:

```json
{
  "project_id": {"value": "your-gcp-project"},
  "region": {"value": "us-central1"},
  "camera_enrollment_url": {"value": "https://..."},
  "camera_config_url": {"value": "https://..."},
  "mcp_server_url": {"value": "wss://..."},
  "chat_interface_url": {"value": "https://..."},
  "certificate_authority": {"value": "-----BEGIN CERTIFICATE-----..."},
  "server_name": {"value": "your-domain.internal"},
  "acap_version": {"value": "1.0.0"},
  "acap_download_url": {"value": "https://storage.googleapis.com/..."}
}
```

### Automatic Configuration

When terraform outputs are available, the camera manager will:

1. **Load Cloud Configuration** automatically
2. **Configure ACAP Deployment** with proper endpoints
3. **Enable Certificate Authentication** for cameras
4. **Connect to MCP Server** for chat functionality

### Manual Configuration

If terraform outputs aren't available:

1. Set deployment ID: `export DEPLOYMENT_ID="your-id"`
2. Use cloud API for configuration
3. Or modify default configuration in `cloudConfig.ts`

## Security Considerations

### Network Security
- Use VPN for remote camera access
- Implement network segmentation
- Monitor camera traffic

### Authentication
- Change default camera credentials
- Use certificate-based auth post-deployment
- Rotate certificates regularly

### Data Protection
- All sensitive data in Secret Manager
- No credentials stored on cameras
- Encrypted communication channels

## Performance Optimization

### Large Deployments
- Adjust concurrency limits in `batchDeploy`
- Implement deployment queuing
- Monitor resource usage

### Network Scanning
- Optimize subnet ranges
- Use parallel scanning
- Cache discovery results

## Monitoring and Logging

### Application Logs
- Check Electron console for errors
- Review deployment progress logs
- Monitor WebSocket connections

### Camera Logs
- Access via VAPIX: `/axis-cgi/debug/debug.tgz`
- Check ACAP application logs
- Monitor system resources

### Cloud Services
- Review Cloud Run logs
- Check MCP server metrics
- Monitor certificate authority

## Next Steps

1. **Scale Testing**: Test with multiple cameras (10+)
2. **Network Optimization**: Optimize discovery for large networks
3. **Advanced Features**: Implement skill builder UI
4. **Mobile App**: Create companion mobile application
5. **Analytics Dashboard**: Add deployment analytics

## Support

For issues and questions:

1. Check this deployment guide
2. Review application logs
3. Test individual components
4. Consult PRD for architectural details
5. Create GitHub issues for bugs