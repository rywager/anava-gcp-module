#!/usr/bin/env python3
"""
Anava Vision Supervisor Service
Enterprise-grade camera auto-discovery and management
"""

import asyncio
import aiohttp
import json
import logging
import os
import socket
import struct
import time
import yaml
from dataclasses import dataclass, asdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Set
from urllib.parse import urlparse
import hashlib
import base64
from aiohttp import BasicAuth, ClientTimeout
from aiohttp_digest_auth import DigestAuth
import netifaces
import ipaddress

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class Camera:
    """Camera configuration"""
    id: str
    name: str
    ip: str
    port: int
    username: str
    password: str
    rtsp_url: str
    model: str
    manufacturer: str
    mac_address: str
    firmware_version: str
    discovered_at: str
    last_seen: str
    capabilities: List[str]
    status: str = "online"
    auth_type: str = "digest"

class CameraDiscovery:
    """Camera discovery service using ONVIF and mDNS"""
    
    def __init__(self, config_path: str = "/etc/anava-vision/cameras.yaml"):
        self.config_path = Path(config_path)
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        self.discovered_cameras: Dict[str, Camera] = {}
        self.load_existing_cameras()
        
    def load_existing_cameras(self):
        """Load previously discovered cameras"""
        if self.config_path.exists():
            try:
                with open(self.config_path, 'r') as f:
                    data = yaml.safe_load(f) or {}
                    for cam_data in data.get('cameras', []):
                        camera = Camera(**cam_data)
                        self.discovered_cameras[camera.id] = camera
                logger.info(f"Loaded {len(self.discovered_cameras)} existing cameras")
            except Exception as e:
                logger.error(f"Error loading cameras: {e}")
    
    def save_cameras(self):
        """Save discovered cameras to configuration"""
        try:
            cameras_data = {
                'cameras': [asdict(cam) for cam in self.discovered_cameras.values()],
                'last_updated': datetime.now().isoformat()
            }
            with open(self.config_path, 'w') as f:
                yaml.dump(cameras_data, f, default_flow_style=False)
            logger.info(f"Saved {len(self.discovered_cameras)} cameras to config")
        except Exception as e:
            logger.error(f"Error saving cameras: {e}")
    
    def get_local_networks(self) -> List[ipaddress.IPv4Network]:
        """Get all local network interfaces"""
        networks = []
        for interface in netifaces.interfaces():
            addrs = netifaces.ifaddresses(interface)
            if netifaces.AF_INET in addrs:
                for addr in addrs[netifaces.AF_INET]:
                    if 'addr' in addr and 'netmask' in addr:
                        try:
                            ip = ipaddress.ip_address(addr['addr'])
                            if not ip.is_loopback:
                                network = ipaddress.ip_network(
                                    f"{addr['addr']}/{addr['netmask']}", 
                                    strict=False
                                )
                                networks.append(network)
                        except:
                            pass
        return networks
    
    async def probe_camera(self, ip: str, port: int = 80) -> Optional[Camera]:
        """Probe a single IP address for camera"""
        try:
            # Try ONVIF probe first
            onvif_url = f"http://{ip}:{port}/onvif/device_service"
            
            # Try common default credentials
            credentials = [
                ("root", "pass"),
                ("admin", "admin"),
                ("admin", "12345"),
                ("root", "root"),
                ("admin", "password")
            ]
            
            timeout = ClientTimeout(total=5)
            
            for username, password in credentials:
                try:
                    # Try digest auth first (common for Axis cameras)
                    async with aiohttp.ClientSession(timeout=timeout) as session:
                        # Test RTSP availability
                        rtsp_url = f"rtsp://{username}:{password}@{ip}:554/axis-media/media.amp"
                        
                        # Try to get device info via HTTP
                        auth = DigestAuth(username, password, session)
                        device_info_url = f"http://{ip}/axis-cgi/param.cgi?action=list&group=root.Brand"
                        
                        async with session.get(device_info_url, auth=auth) as resp:
                            if resp.status == 200:
                                content = await resp.text()
                                
                                # Generate camera ID
                                camera_id = hashlib.md5(ip.encode()).hexdigest()[:8]
                                
                                # Parse Axis camera info
                                model = "Unknown"
                                manufacturer = "Axis"
                                if "root.Brand.ProdNbr=" in content:
                                    model = content.split("root.Brand.ProdNbr=")[1].split("\n")[0]
                                
                                camera = Camera(
                                    id=camera_id,
                                    name=f"Camera-{camera_id}",
                                    ip=ip,
                                    port=port,
                                    username=username,
                                    password=password,
                                    rtsp_url=rtsp_url,
                                    model=model,
                                    manufacturer=manufacturer,
                                    mac_address="00:00:00:00:00:00",  # Would need ARP lookup
                                    firmware_version="Unknown",
                                    discovered_at=datetime.now().isoformat(),
                                    last_seen=datetime.now().isoformat(),
                                    capabilities=["rtsp", "digest_auth", "h264"],
                                    auth_type="digest"
                                )
                                
                                logger.info(f"Discovered camera at {ip} - {manufacturer} {model}")
                                return camera
                        
                        # Try basic auth if digest fails
                        basic_auth = BasicAuth(username, password)
                        async with session.get(f"http://{ip}/", auth=basic_auth) as resp:
                            if resp.status == 200:
                                camera_id = hashlib.md5(ip.encode()).hexdigest()[:8]
                                
                                camera = Camera(
                                    id=camera_id,
                                    name=f"Camera-{camera_id}",
                                    ip=ip,
                                    port=port,
                                    username=username,
                                    password=password,
                                    rtsp_url=f"rtsp://{username}:{password}@{ip}:554/",
                                    model="Generic",
                                    manufacturer="Unknown",
                                    mac_address="00:00:00:00:00:00",
                                    firmware_version="Unknown",
                                    discovered_at=datetime.now().isoformat(),
                                    last_seen=datetime.now().isoformat(),
                                    capabilities=["rtsp", "basic_auth"],
                                    auth_type="basic"
                                )
                                
                                logger.info(f"Discovered generic camera at {ip}")
                                return camera
                                
                except Exception as e:
                    continue
                    
        except Exception as e:
            logger.debug(f"Failed to probe {ip}: {e}")
        
        return None
    
    async def scan_network(self, network: ipaddress.IPv4Network):
        """Scan a network for cameras"""
        logger.info(f"Scanning network {network}")
        
        tasks = []
        # Scan common camera ports
        ports = [80, 8080, 554]
        
        for ip in network.hosts():
            for port in ports:
                task = self.probe_camera(str(ip), port)
                tasks.append(task)
        
        # Limit concurrent connections
        semaphore = asyncio.Semaphore(50)
        
        async def bounded_probe(ip, port):
            async with semaphore:
                return await self.probe_camera(ip, port)
        
        bounded_tasks = []
        for ip in network.hosts():
            for port in ports:
                task = bounded_probe(str(ip), port)
                bounded_tasks.append(task)
        
        results = await asyncio.gather(*bounded_tasks, return_exceptions=True)
        
        for result in results:
            if isinstance(result, Camera):
                self.discovered_cameras[result.id] = result
                self.save_cameras()
    
    async def discover_cameras(self):
        """Main discovery process"""
        logger.info("Starting camera discovery...")
        
        # Get local networks
        networks = self.get_local_networks()
        logger.info(f"Found {len(networks)} local networks")
        
        # Scan each network
        for network in networks:
            await self.scan_network(network)
        
        logger.info(f"Discovery complete. Found {len(self.discovered_cameras)} cameras")
        return list(self.discovered_cameras.values())

class CameraHealthMonitor:
    """Monitor camera health and availability"""
    
    def __init__(self, discovery: CameraDiscovery):
        self.discovery = discovery
        self.health_status = {}
        
    async def check_camera_health(self, camera: Camera) -> bool:
        """Check if camera is responding"""
        try:
            timeout = ClientTimeout(total=5)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                if camera.auth_type == "digest":
                    auth = DigestAuth(camera.username, camera.password, session)
                else:
                    auth = BasicAuth(camera.username, camera.password)
                
                async with session.get(f"http://{camera.ip}:{camera.port}/", auth=auth) as resp:
                    if resp.status in [200, 401]:  # 401 means auth required but camera is up
                        camera.status = "online"
                        camera.last_seen = datetime.now().isoformat()
                        return True
        except:
            pass
        
        camera.status = "offline"
        return False
    
    async def monitor_loop(self):
        """Continuous health monitoring"""
        while True:
            try:
                logger.info("Running health check...")
                
                for camera in self.discovery.discovered_cameras.values():
                    is_healthy = await self.check_camera_health(camera)
                    self.health_status[camera.id] = {
                        'healthy': is_healthy,
                        'last_check': datetime.now().isoformat()
                    }
                
                self.discovery.save_cameras()
                
                # Publish health metrics
                await self.publish_metrics()
                
            except Exception as e:
                logger.error(f"Health check error: {e}")
            
            # Check every 30 seconds
            await asyncio.sleep(30)
    
    async def publish_metrics(self):
        """Publish health metrics to monitoring system"""
        metrics = {
            'total_cameras': len(self.discovery.discovered_cameras),
            'online_cameras': sum(1 for c in self.discovery.discovered_cameras.values() if c.status == "online"),
            'offline_cameras': sum(1 for c in self.discovery.discovered_cameras.values() if c.status == "offline"),
            'timestamp': datetime.now().isoformat()
        }
        
        # Write to metrics file for Prometheus
        metrics_path = Path("/var/lib/anava-vision/metrics.json")
        metrics_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(metrics_path, 'w') as f:
            json.dump(metrics, f, indent=2)

class ConfigurationManager:
    """Manage system configuration and updates"""
    
    def __init__(self):
        self.config_dir = Path("/etc/anava-vision")
        self.config_dir.mkdir(parents=True, exist_ok=True)
        
    def generate_nginx_config(self, cameras: List[Camera]):
        """Generate Nginx configuration for cameras"""
        config = """
# Anava Vision Camera Proxy Configuration
# Auto-generated - Do not edit manually

upstream camera_backend {
    least_conn;
"""
        
        for camera in cameras:
            if camera.status == "online":
                config += f"    server {camera.ip}:{camera.port} max_fails=3 fail_timeout=30s;\n"
        
        config += "}\n\n"
        
        # Add location blocks for each camera
        for camera in cameras:
            config += f"""
location /camera/{camera.id}/ {{
    proxy_pass http://{camera.ip}:{camera.port}/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Camera-ID {camera.id};
    
    # Authentication
    proxy_set_header Authorization $http_authorization;
    proxy_pass_header Authorization;
    
    # WebSocket support for live streams
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    
    # Timeouts for streaming
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}}
"""
        
        # Write config
        nginx_config_path = self.config_dir / "nginx-cameras.conf"
        with open(nginx_config_path, 'w') as f:
            f.write(config)
        
        logger.info(f"Generated Nginx config for {len(cameras)} cameras")
        
        # Reload Nginx
        os.system("nginx -t && nginx -s reload")
    
    def generate_docker_compose_override(self, cameras: List[Camera]):
        """Generate Docker Compose override for dynamic camera configuration"""
        compose_data = {
            'version': '3.8',
            'services': {
                'camera-streams': {
                    'environment': []
                }
            }
        }
        
        # Add camera environment variables
        for i, camera in enumerate(cameras):
            compose_data['services']['camera-streams']['environment'].extend([
                f"CAMERA_{i}_ID={camera.id}",
                f"CAMERA_{i}_URL={camera.rtsp_url}",
                f"CAMERA_{i}_NAME={camera.name}"
            ])
        
        compose_data['services']['camera-streams']['environment'].append(
            f"CAMERA_COUNT={len(cameras)}"
        )
        
        # Write override file
        override_path = self.config_dir / "docker-compose.override.yml"
        with open(override_path, 'w') as f:
            yaml.dump(compose_data, f, default_flow_style=False)
        
        logger.info("Generated Docker Compose override file")

async def main():
    """Main supervisor loop"""
    logger.info("Starting Anava Vision Supervisor Service")
    
    # Initialize components
    discovery = CameraDiscovery()
    health_monitor = CameraHealthMonitor(discovery)
    config_manager = ConfigurationManager()
    
    # Initial discovery
    await discovery.discover_cameras()
    
    # Generate initial configurations
    cameras = list(discovery.discovered_cameras.values())
    config_manager.generate_nginx_config(cameras)
    config_manager.generate_docker_compose_override(cameras)
    
    # Create background tasks
    tasks = [
        asyncio.create_task(health_monitor.monitor_loop()),
    ]
    
    # Periodic rediscovery
    async def rediscovery_loop():
        while True:
            await asyncio.sleep(300)  # Every 5 minutes
            await discovery.discover_cameras()
            cameras = list(discovery.discovered_cameras.values())
            config_manager.generate_nginx_config(cameras)
            config_manager.generate_docker_compose_override(cameras)
    
    tasks.append(asyncio.create_task(rediscovery_loop()))
    
    # Wait for all tasks
    try:
        await asyncio.gather(*tasks)
    except KeyboardInterrupt:
        logger.info("Shutting down supervisor service")
        for task in tasks:
            task.cancel()

if __name__ == "__main__":
    asyncio.run(main())