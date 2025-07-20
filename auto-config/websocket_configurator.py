#!/usr/bin/env python3
"""
WebSocket Path Auto-Configuration for Anava Vision
Automatically discovers and validates WebSocket endpoints
"""

import asyncio
import websockets
import aiohttp
import json
import logging
import time
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from urllib.parse import urlparse, parse_qs
import ssl
import certifi

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class WebSocketConfig:
    """WebSocket endpoint configuration"""
    url: str
    protocol: str  # ws or wss
    path: str
    params: Dict[str, str]
    auth_type: str  # basic, digest, token
    ssl_verify: bool
    validated: bool = False
    latency: float = 0.0
    error: Optional[str] = None
    
    def to_dict(self):
        return {
            'url': self.url,
            'protocol': self.protocol,
            'path': self.path,
            'params': self.params,
            'auth_type': self.auth_type,
            'ssl_verify': self.ssl_verify,
            'validated': self.validated,
            'latency': self.latency,
            'error': self.error
        }


class WebSocketConfigurator:
    """Auto-configures WebSocket connections"""
    
    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password
        self.discovered_endpoints: List[WebSocketConfig] = []
        
    async def discover_websocket_paths(self, camera_ip: str, camera_model: str = None) -> List[WebSocketConfig]:
        """Discover all WebSocket paths for a camera"""
        endpoints = []
        
        # Common WebSocket paths for Axis cameras
        ws_paths = self._get_websocket_paths(camera_model)
        
        # Test both ws and wss protocols
        for protocol in ['ws', 'wss']:
            for path_config in ws_paths:
                path = path_config['path']
                params = path_config.get('params', {})
                
                # Build URL with parameters
                param_str = '&'.join([f"{k}={v}" for k, v in params.items()])
                full_path = f"{path}?{param_str}" if param_str else path
                url = f"{protocol}://{camera_ip}{full_path}"
                
                config = WebSocketConfig(
                    url=url,
                    protocol=protocol,
                    path=path,
                    params=params,
                    auth_type=path_config.get('auth', 'basic'),
                    ssl_verify=path_config.get('ssl_verify', False)
                )
                
                # Validate the endpoint
                await self._validate_endpoint(config)
                
                if config.validated:
                    endpoints.append(config)
                    logger.info(f"Valid WebSocket endpoint: {url}")
                else:
                    logger.debug(f"Invalid endpoint {url}: {config.error}")
        
        self.discovered_endpoints.extend(endpoints)
        return endpoints
    
    def _get_websocket_paths(self, camera_model: str = None) -> List[Dict]:
        """Get WebSocket paths based on camera model"""
        # Base paths that work for most Axis cameras
        base_paths = [
            {
                'path': '/rtsp-over-websocket',
                'params': {
                    'video': 'h264',
                    'audio': '0',
                    'resolution': '1920x1080',
                    'fps': '30'
                },
                'auth': 'digest'
            },
            {
                'path': '/ws',
                'params': {},
                'auth': 'basic'
            },
            {
                'path': '/websocket',
                'params': {},
                'auth': 'basic'
            },
            {
                'path': '/axis-cgi/websocket',
                'params': {},
                'auth': 'digest'
            }
        ]
        
        # Model-specific paths
        if camera_model:
            if 'M30' in camera_model or 'M31' in camera_model:
                base_paths.extend([
                    {
                        'path': '/axis-media/media.amp/websocket',
                        'params': {'video': '1'},
                        'auth': 'digest'
                    }
                ])
            elif 'P32' in camera_model or 'P33' in camera_model:
                base_paths.extend([
                    {
                        'path': '/ptz/websocket',
                        'params': {},
                        'auth': 'digest'
                    }
                ])
            elif 'Q16' in camera_model:
                base_paths.extend([
                    {
                        'path': '/thermal/websocket',
                        'params': {},
                        'auth': 'digest'
                    }
                ])
        
        return base_paths
    
    async def _validate_endpoint(self, config: WebSocketConfig) -> None:
        """Validate a WebSocket endpoint"""
        start_time = time.time()
        
        try:
            # Create SSL context for wss
            ssl_context = None
            if config.protocol == 'wss':
                ssl_context = ssl.create_default_context()
                if not config.ssl_verify:
                    ssl_context.check_hostname = False
                    ssl_context.verify_mode = ssl.CERT_NONE
            
            # Add authentication headers
            headers = self._create_auth_headers(config.auth_type)
            
            # Try to connect
            async with websockets.connect(
                config.url,
                extra_headers=headers,
                ssl=ssl_context,
                timeout=5,
                max_size=10 * 1024 * 1024  # 10MB max message size
            ) as websocket:
                # Send a test message
                test_message = {
                    'type': 'ping',
                    'timestamp': time.time()
                }
                await websocket.send(json.dumps(test_message))
                
                # Wait for response
                try:
                    response = await asyncio.wait_for(websocket.recv(), timeout=2)
                    config.validated = True
                    config.latency = (time.time() - start_time) * 1000  # ms
                    
                    # Check if response is valid
                    if isinstance(response, str):
                        try:
                            json.loads(response)
                        except:
                            # Not JSON, might be binary stream
                            pass
                except asyncio.TimeoutError:
                    # No response but connection works
                    config.validated = True
                    config.latency = (time.time() - start_time) * 1000
                
                await websocket.close()
                
        except websockets.exceptions.InvalidStatusCode as e:
            config.error = f"Invalid status code: {e.status_code}"
            if e.status_code == 401:
                config.error += " (Authentication required)"
            elif e.status_code == 403:
                config.error += " (Forbidden - check credentials)"
        except Exception as e:
            config.error = str(e)
    
    def _create_auth_headers(self, auth_type: str) -> Dict[str, str]:
        """Create authentication headers"""
        import base64
        
        headers = {}
        
        if auth_type == 'basic':
            credentials = base64.b64encode(
                f"{self.username}:{self.password}".encode()
            ).decode()
            headers['Authorization'] = f"Basic {credentials}"
        elif auth_type == 'digest':
            # For digest auth, we'd need to make an initial request
            # For now, we'll try basic auth as fallback
            credentials = base64.b64encode(
                f"{self.username}:{self.password}".encode()
            ).decode()
            headers['Authorization'] = f"Basic {credentials}"
        elif auth_type == 'token':
            # Token auth would need to be obtained first
            headers['Authorization'] = f"Bearer {self.password}"
        
        return headers
    
    async def find_optimal_endpoint(self, endpoints: List[WebSocketConfig]) -> Optional[WebSocketConfig]:
        """Find the optimal WebSocket endpoint based on latency and features"""
        valid_endpoints = [ep for ep in endpoints if ep.validated]
        
        if not valid_endpoints:
            return None
        
        # Sort by latency
        valid_endpoints.sort(key=lambda x: x.latency)
        
        # Prefer wss over ws for security
        secure_endpoints = [ep for ep in valid_endpoints if ep.protocol == 'wss']
        if secure_endpoints:
            return secure_endpoints[0]
        
        return valid_endpoints[0]
    
    async def test_stream_quality(self, config: WebSocketConfig) -> Dict:
        """Test stream quality and capabilities"""
        quality_report = {
            'fps': 0,
            'resolution': '',
            'codec': '',
            'bitrate': 0,
            'packet_loss': 0,
            'jitter': 0
        }
        
        try:
            ssl_context = None
            if config.protocol == 'wss':
                ssl_context = ssl.create_default_context()
                if not config.ssl_verify:
                    ssl_context.check_hostname = False
                    ssl_context.verify_mode = ssl.CERT_NONE
            
            headers = self._create_auth_headers(config.auth_type)
            
            async with websockets.connect(
                config.url,
                extra_headers=headers,
                ssl=ssl_context,
                timeout=5
            ) as websocket:
                # Collect stream data for analysis
                start_time = time.time()
                frame_count = 0
                total_bytes = 0
                timestamps = []
                
                while time.time() - start_time < 5:  # Test for 5 seconds
                    try:
                        data = await asyncio.wait_for(websocket.recv(), timeout=1)
                        frame_count += 1
                        total_bytes += len(data)
                        timestamps.append(time.time())
                        
                        # Try to parse stream info if it's JSON
                        if isinstance(data, str):
                            try:
                                msg = json.loads(data)
                                if 'resolution' in msg:
                                    quality_report['resolution'] = msg['resolution']
                                if 'codec' in msg:
                                    quality_report['codec'] = msg['codec']
                            except:
                                pass
                    except asyncio.TimeoutError:
                        continue
                
                # Calculate metrics
                duration = time.time() - start_time
                quality_report['fps'] = frame_count / duration
                quality_report['bitrate'] = (total_bytes * 8) / duration / 1000  # Kbps
                
                # Calculate jitter
                if len(timestamps) > 1:
                    intervals = [timestamps[i] - timestamps[i-1] for i in range(1, len(timestamps))]
                    avg_interval = sum(intervals) / len(intervals)
                    quality_report['jitter'] = sum(abs(interval - avg_interval) for interval in intervals) / len(intervals) * 1000  # ms
                
                await websocket.close()
                
        except Exception as e:
            logger.error(f"Stream quality test failed: {e}")
        
        return quality_report
    
    def save_configuration(self, filename: str = 'websocket_config.json'):
        """Save WebSocket configuration"""
        data = {
            'timestamp': time.time(),
            'endpoints': [ep.to_dict() for ep in self.discovered_endpoints]
        }
        
        with open(filename, 'w') as f:
            json.dump(data, f, indent=2)
        
        logger.info(f"Saved {len(self.discovered_endpoints)} WebSocket endpoints to {filename}")
    
    async def auto_configure_camera_websockets(self, cameras: List[Dict]) -> Dict[str, WebSocketConfig]:
        """Auto-configure WebSocket for multiple cameras"""
        camera_configs = {}
        
        for camera in cameras:
            camera_ip = camera['ip']
            camera_model = camera.get('model', '')
            
            logger.info(f"Configuring WebSocket for {camera_ip} ({camera_model})")
            
            # Discover endpoints
            endpoints = await self.discover_websocket_paths(camera_ip, camera_model)
            
            # Find optimal endpoint
            optimal = await self.find_optimal_endpoint(endpoints)
            
            if optimal:
                # Test stream quality
                quality = await self.test_stream_quality(optimal)
                logger.info(f"Stream quality for {camera_ip}: {quality}")
                
                camera_configs[camera_ip] = optimal
            else:
                logger.warning(f"No valid WebSocket endpoint found for {camera_ip}")
        
        return camera_configs


async def main():
    """Main configuration function"""
    import sys
    
    username = sys.argv[1] if len(sys.argv) > 1 else 'root'
    password = sys.argv[2] if len(sys.argv) > 2 else 'admin'
    
    # Load discovered cameras
    try:
        with open('discovered_cameras.json', 'r') as f:
            camera_data = json.load(f)
            cameras = camera_data['cameras']
    except:
        # Test with a single camera
        cameras = [{'ip': '192.168.1.100', 'model': 'AXIS-M3067'}]
    
    configurator = WebSocketConfigurator(username, password)
    
    # Auto-configure all cameras
    configs = await configurator.auto_configure_camera_websockets(cameras)
    
    logger.info(f"Configured {len(configs)} cameras:")
    for ip, config in configs.items():
        logger.info(f"  - {ip}: {config.url} (latency: {config.latency:.1f}ms)")
    
    configurator.save_configuration()


if __name__ == '__main__':
    asyncio.run(main())