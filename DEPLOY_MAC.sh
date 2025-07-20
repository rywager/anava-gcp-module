#!/bin/bash

# Anava Vision - macOS Deployment Script
# Works on your Mac without systemd

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
CAMERA_IP="192.168.50.156"
CAMERA_USER="root"
CAMERA_PASS="pass"
INSTALL_DIR="$HOME/anava-vision-deployment"

echo -e "${GREEN}🚀 Anava Vision Deployment for macOS${NC}"
echo "======================================"

# Step 1: Create deployment directory
echo -e "${YELLOW}Creating deployment directory...${NC}"
mkdir -p $INSTALL_DIR
cd $INSTALL_DIR

# Step 2: Create docker-compose.yml
echo -e "${YELLOW}Creating Docker Compose configuration...${NC}"

cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  # Traefik handles all routing
  traefik:
    image: traefik:v2.10
    container_name: anava-traefik
    command:
      - "--api.dashboard=true"
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
    ports:
      - "8080:80"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
    restart: unless-stopped

  # Simple orchestrator for WebSocket
  orchestrator:
    image: node:18-alpine
    container_name: anava-orchestrator
    working_dir: /app
    volumes:
      - ./orchestrator:/app
    environment:
      - NODE_ENV=production
      - PORT=3000
    command: >
      sh -c "
        npm install &&
        node server.js
      "
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.orchestrator.rule=PathPrefix(`/ws`)"
      - "traefik.http.services.orchestrator.loadbalancer.server.port=3000"
    restart: unless-stopped

  # Camera discovery service
  camera-discovery:
    build:
      context: ./camera-discovery
      dockerfile: Dockerfile
    container_name: anava-camera-discovery
    environment:
      - CAMERA_IP=${CAMERA_IP}
      - CAMERA_USER=${CAMERA_USER}
      - CAMERA_PASS=${CAMERA_PASS}
    volumes:
      - ./config:/config
    restart: unless-stopped
EOF

# Step 3: Create camera discovery service
echo -e "${YELLOW}Creating camera discovery service...${NC}"

mkdir -p camera-discovery
cat > camera-discovery/Dockerfile << 'EOF'
FROM python:3.9-slim
WORKDIR /app
RUN pip install requests
COPY discover.py .
CMD ["python", "-u", "discover.py"]
EOF

cat > camera-discovery/discover.py << 'EOF'
#!/usr/bin/env python3
import os
import time
import requests
from requests.auth import HTTPDigestAuth
import json

CAMERA_IP = os.environ.get('CAMERA_IP', '192.168.50.156')
CAMERA_USER = os.environ.get('CAMERA_USER', 'root')
CAMERA_PASS = os.environ.get('CAMERA_PASS', 'pass')

def test_camera():
    """Test camera connection with digest auth"""
    print(f"🔍 Testing camera at {CAMERA_IP}...")
    
    # Try different endpoints
    endpoints = [
        '/axis-cgi/basicdeviceinfo.cgi',
        '/axis-cgi/param.cgi?action=list&group=root.Brand',
        '/axis-cgi/mjpg/video.cgi',
    ]
    
    for endpoint in endpoints:
        url = f"http://{CAMERA_IP}{endpoint}"
        try:
            response = requests.get(url, auth=HTTPDigestAuth(CAMERA_USER, CAMERA_PASS), timeout=5)
            print(f"  {endpoint}: {response.status_code}")
            
            if response.status_code == 200:
                print(f"✅ Camera endpoint accessible: {endpoint}")
                
                # Save RTSP configuration
                rtsp_url = f"rtsp://{CAMERA_USER}:{CAMERA_PASS}@{CAMERA_IP}:554/axis-media/media.amp"
                config = {
                    "camera_ip": CAMERA_IP,
                    "rtsp_url": rtsp_url,
                    "http_endpoint": url,
                    "discovered_at": time.time()
                }
                
                os.makedirs('/config', exist_ok=True)
                with open('/config/camera.json', 'w') as f:
                    json.dump(config, f, indent=2)
                print(f"✅ Configuration saved")
                return True
                
        except Exception as e:
            print(f"  {endpoint}: Failed - {str(e)[:50]}")
    
    return False

# Keep testing
while True:
    if test_camera():
        print("✅ Camera is accessible")
        time.sleep(60)  # Check every minute
    else:
        print("⏳ Retrying in 10 seconds...")
        time.sleep(10)
EOF

# Step 4: Create simple orchestrator
echo -e "${YELLOW}Creating orchestrator...${NC}"

mkdir -p orchestrator
cat > orchestrator/package.json << 'EOF'
{
  "name": "anava-orchestrator",
  "version": "1.0.0",
  "dependencies": {
    "ws": "^8.13.0",
    "express": "^4.18.2"
  }
}
EOF

cat > orchestrator/server.js << 'EOF'
const express = require('express');
const { WebSocketServer } = require('ws');

const app = express();
const port = process.env.PORT || 3000;

// Health endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    connections: wss ? wss.clients.size : 0
  });
});

// Start HTTP server
const server = app.listen(port, () => {
  console.log(`Orchestrator listening on port ${port}`);
});

// WebSocket server
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (ws) => {
  console.log('New WebSocket connection');
  
  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to Anava Orchestrator'
  }));
  
  ws.on('message', (data) => {
    console.log('Received:', data.toString());
  });
  
  ws.on('close', () => {
    console.log('Connection closed');
  });
});

console.log('Orchestrator ready');
EOF

# Step 5: Copy Edge Gateway if exists
if [ -d "/Users/ryanwager/terraform-installer/edge-gateway" ]; then
    echo -e "${YELLOW}Copying Edge Gateway...${NC}"
    cp -r /Users/ryanwager/terraform-installer/edge-gateway .
    
    # Update edge gateway docker-compose
    cat >> docker-compose.yml << 'EOF'

  # Edge Gateway
  edge-gateway:
    build:
      context: ./edge-gateway
      dockerfile: Dockerfile
    container_name: anava-edge-gateway
    environment:
      - CLOUD_ORCHESTRATOR_URL=ws://orchestrator:3000/ws
      - CAMERA_USERNAME=${CAMERA_USER}
      - CAMERA_PASSWORD=${CAMERA_PASS}
      - CAMERA_IP=${CAMERA_IP}
      - STUN_SERVERS=stun:34.36.165.222:3478
      - TURN_SERVERS=turn:34.36.165.222:3478
      - TURN_USERNAME=webrtc
      - TURN_PASSWORD=*K(HYvjykFXf[ISCRmo]b4MGr0F&Yt>g
    depends_on:
      - orchestrator
    restart: unless-stopped
EOF
fi

# Step 6: Test camera directly
echo -e "${YELLOW}Testing camera connection...${NC}"

# Test with curl
if curl -s --digest -u "$CAMERA_USER:$CAMERA_PASS" "http://$CAMERA_IP/axis-cgi/basicdeviceinfo.cgi" --connect-timeout 5 | grep -q "SerialNumber"; then
    echo -e "${GREEN}✅ Camera is accessible with digest auth${NC}"
else
    echo -e "${RED}⚠️  Cannot connect to camera - will retry in service${NC}"
fi

# Step 7: Start everything
echo -e "${YELLOW}Starting services...${NC}"

# Pull/build images
docker compose build
docker compose pull

# Start services
docker compose up -d

# Step 8: Show status
echo -e "${YELLOW}Checking service status...${NC}"
sleep 5

docker compose ps

# Step 9: Show logs from camera discovery
echo -e "${YELLOW}Camera discovery logs:${NC}"
docker compose logs camera-discovery | tail -20

# Step 10: Create helper scripts
echo -e "${YELLOW}Creating helper scripts...${NC}"

cat > start.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
docker compose up -d
docker compose ps
EOF
chmod +x start.sh

cat > stop.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
docker compose down
EOF
chmod +x stop.sh

cat > logs.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
docker compose logs -f
EOF
chmod +x logs.sh

cat > status.sh << 'EOF'
#!/bin/bash
cd "$(dirname "$0")"
echo "=== Service Status ==="
docker compose ps
echo ""
echo "=== Camera Discovery ==="
docker compose logs camera-discovery | tail -10
echo ""
echo "=== Orchestrator Health ==="
curl -s http://localhost:8080/health | jq . || echo "Orchestrator not accessible"
EOF
chmod +x status.sh

# Final message
echo ""
echo -e "${GREEN}🎉 Anava Vision Deployment Complete!${NC}"
echo "====================================="
echo ""
echo "Deployment Directory: $INSTALL_DIR"
echo ""
echo "Services:"
echo "  - Traefik (Router): http://localhost:8080"
echo "  - Orchestrator Health: http://localhost:8080/health"
echo "  - Camera Discovery: Running (check logs)"
echo ""
echo "Helper Scripts:"
echo "  ./start.sh  - Start all services"
echo "  ./stop.sh   - Stop all services"
echo "  ./logs.sh   - View logs"
echo "  ./status.sh - Check status"
echo ""
echo "Camera Configuration:"
echo "  IP: $CAMERA_IP"
echo "  Auth: Digest ($CAMERA_USER)"
echo ""
echo -e "${YELLOW}Run './logs.sh' to monitor the services${NC}"