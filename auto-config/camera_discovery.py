#!/usr/bin/env python3
"""
Camera Discovery Service for Anava Vision
Automatically discovers Axis cameras on the network with digest auth support
"""

import asyncio
import aiohttp
import ipaddress
import socket
import struct
import xml.etree.ElementTree as ET
from typing import List, Dict, Optional, Set
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor
import logging
from urllib.parse import urlparse, quote
import hashlib
import time
import json

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class AxisCamera:
    """Represents a discovered Axis camera"""
    ip: str
    mac: str
    model: str
    serial: str
    firmware: str
    name: str
    rtsp_url: Optional[str] = None
    websocket_url: Optional[str] = None
    digest_auth: Optional[Dict] = None
    capabilities: Dict = None
    
    def to_dict(self):
        return {
            'ip': self.ip,
            'mac': self.mac,
            'model': self.model,
            'serial': self.serial,
            'firmware': self.firmware,
            'name': self.name,
            'rtsp_url': self.rtsp_url,
            'websocket_url': self.websocket_url,
            'capabilities': self.capabilities
        }


class CameraDiscovery:
    """Discovers and configures Axis cameras on the network"""
    
    def __init__(self, username: str, password: str):
        self.username = username
        self.password = password
        self.discovered_cameras: Dict[str, AxisCamera] = {}
        self.executor = ThreadPoolExecutor(max_workers=50)
        
    async def discover_cameras(self, network_range: str = None) -> List[AxisCamera]:
        """Discover all Axis cameras on the network"""
        cameras = []
        
        # Try multiple discovery methods in parallel
        discovery_tasks = [
            self._upnp_discovery(),
            self._bonjour_discovery(),
            self._axis_discovery_protocol()
        ]
        
        # If network range specified, also scan it
        if network_range:
            discovery_tasks.append(self._network_scan(network_range))
        
        results = await asyncio.gather(*discovery_tasks, return_exceptions=True)
        
        # Combine all discovered IPs
        discovered_ips = set()
        for result in results:
            if isinstance(result, set):
                discovered_ips.update(result)
        
        # Probe each discovered IP for camera details
        probe_tasks = [self._probe_camera(ip) for ip in discovered_ips]
        camera_results = await asyncio.gather(*probe_tasks, return_exceptions=True)
        
        for camera in camera_results:
            if camera and not isinstance(camera, Exception):
                cameras.append(camera)
                self.discovered_cameras[camera.ip] = camera
        
        return cameras
    
    async def _upnp_discovery(self) -> Set[str]:
        """Discover cameras using UPnP/SSDP"""
        discovered_ips = set()
        
        # SSDP multicast address
        multicast_group = '239.255.255.250'
        port = 1900
        
        # Create UDP socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.settimeout(3)
        
        # SSDP M-SEARCH message
        message = '\r\n'.join([
            'M-SEARCH * HTTP/1.1',
            f'HOST: {multicast_group}:{port}',
            'MAN: "ssdp:discover"',
            'MX: 3',
            'ST: urn:axis-com:service:BasicService:1',
            '', ''
        ])
        
        try:
            sock.sendto(message.encode(), (multicast_group, port))
            
            # Listen for responses
            start_time = time.time()
            while time.time() - start_time < 3:
                try:
                    data, addr = sock.recvfrom(65535)
                    if b'axis' in data.lower():
                        discovered_ips.add(addr[0])
                        logger.info(f"UPnP discovered camera at {addr[0]}")
                except socket.timeout:
                    break
        except Exception as e:
            logger.error(f"UPnP discovery error: {e}")
        finally:
            sock.close()
        
        return discovered_ips
    
    async def _bonjour_discovery(self) -> Set[str]:
        """Discover cameras using Bonjour/mDNS"""
        discovered_ips = set()
        
        try:
            # Try using dns-sd command (macOS/Linux)
            proc = await asyncio.create_subprocess_exec(
                'dns-sd', '-B', '_axis-video._tcp', 'local.',
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            # Wait for 3 seconds then terminate
            try:
                stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=3)
                # Parse output for IP addresses
                # This is simplified - real implementation would parse properly
                lines = stdout.decode().split('\n')
                for line in lines:
                    if 'axis' in line.lower():
                        # Extract IP from the line
                        parts = line.split()
                        for part in parts:
                            if '.' in part and part.count('.') == 3:
                                try:
                                    socket.inet_aton(part)
                                    discovered_ips.add(part)
                                except:
                                    pass
            except asyncio.TimeoutError:
                proc.terminate()
        except Exception as e:
            logger.debug(f"Bonjour discovery not available: {e}")
        
        return discovered_ips
    
    async def _axis_discovery_protocol(self) -> Set[str]:
        """Use Axis Discovery Protocol (ADP)"""
        discovered_ips = set()
        
        # ADP uses UDP broadcast on port 3702
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sock.settimeout(3)
        
        # WS-Discovery probe message
        probe_message = '''<?xml version="1.0" encoding="UTF-8"?>
<Envelope xmlns="http://www.w3.org/2003/05/soap-envelope">
    <Body>
        <Probe xmlns="http://schemas.xmlsoap.org/ws/2005/04/discovery">
            <Types>tdn:NetworkVideoTransmitter</Types>
        </Probe>
    </Body>
</Envelope>'''
        
        try:
            sock.sendto(probe_message.encode(), ('<broadcast>', 3702))
            
            start_time = time.time()
            while time.time() - start_time < 3:
                try:
                    data, addr = sock.recvfrom(65535)
                    if b'axis' in data.lower() or b'NetworkVideoTransmitter' in data:
                        discovered_ips.add(addr[0])
                        logger.info(f"ADP discovered camera at {addr[0]}")
                except socket.timeout:
                    break
        except Exception as e:
            logger.error(f"ADP discovery error: {e}")
        finally:
            sock.close()
        
        return discovered_ips
    
    async def _network_scan(self, network_range: str) -> Set[str]:
        """Scan network range for cameras"""
        discovered_ips = set()
        
        try:
            network = ipaddress.ip_network(network_range, strict=False)
            
            # Quick port scan for common Axis ports
            scan_tasks = []
            for ip in network.hosts():
                scan_tasks.append(self._check_axis_port(str(ip)))
            
            # Limit concurrent scans
            chunk_size = 50
            for i in range(0, len(scan_tasks), chunk_size):
                chunk = scan_tasks[i:i + chunk_size]
                results = await asyncio.gather(*chunk, return_exceptions=True)
                
                for ip, is_axis in results:
                    if is_axis:
                        discovered_ips.add(ip)
                        logger.info(f"Network scan found camera at {ip}")
        except Exception as e:
            logger.error(f"Network scan error: {e}")
        
        return discovered_ips
    
    async def _check_axis_port(self, ip: str) -> tuple:
        """Check if an IP has Axis camera ports open"""
        common_ports = [80, 443, 554]  # HTTP, HTTPS, RTSP
        
        for port in common_ports:
            try:
                _, writer = await asyncio.wait_for(
                    asyncio.open_connection(ip, port),
                    timeout=0.5
                )
                writer.close()
                await writer.wait_closed()
                
                # Try to verify it's an Axis camera
                if await self._verify_axis_camera(ip, port):
                    return ip, True
            except:
                continue
        
        return ip, False
    
    async def _verify_axis_camera(self, ip: str, port: int) -> bool:
        """Verify if the device is an Axis camera"""
        protocol = 'https' if port == 443 else 'http'
        url = f"{protocol}://{ip}:{port}/axis-cgi/basicdeviceinfo.cgi"
        
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    timeout=aiohttp.ClientTimeout(total=2),
                    ssl=False
                ) as response:
                    text = await response.text()
                    return 'axis' in text.lower() or response.status == 401
        except:
            return False
    
    async def _probe_camera(self, ip: str) -> Optional[AxisCamera]:
        """Probe a camera for detailed information"""
        try:
            # Get basic device info
            device_info = await self._get_device_info(ip)
            if not device_info:
                return None
            
            camera = AxisCamera(**device_info)
            
            # Get capabilities
            camera.capabilities = await self._get_capabilities(ip)
            
            # Discover RTSP URL
            camera.rtsp_url = await self._discover_rtsp_url(ip)
            
            # Discover WebSocket URL
            camera.websocket_url = await self._discover_websocket_url(ip)
            
            return camera
        except Exception as e:
            logger.error(f"Error probing camera at {ip}: {e}")
            return None
    
    async def _get_device_info(self, ip: str) -> Optional[Dict]:
        """Get basic device information"""
        urls = [
            f"http://{ip}/axis-cgi/basicdeviceinfo.cgi",
            f"https://{ip}/axis-cgi/basicdeviceinfo.cgi"
        ]
        
        for url in urls:
            try:
                async with aiohttp.ClientSession() as session:
                    # First try without auth
                    async with session.get(
                        url,
                        timeout=aiohttp.ClientTimeout(total=5),
                        ssl=False
                    ) as response:
                        if response.status == 401:
                            # Need authentication
                            auth = self._create_digest_auth(response.headers)
                            async with session.get(
                                url,
                                headers={'Authorization': auth},
                                timeout=aiohttp.ClientTimeout(total=5),
                                ssl=False
                            ) as auth_response:
                                if auth_response.status == 200:
                                    return self._parse_device_info(
                                        await auth_response.text(),
                                        ip
                                    )
                        elif response.status == 200:
                            return self._parse_device_info(
                                await response.text(),
                                ip
                            )
            except Exception as e:
                logger.debug(f"Failed to get device info from {url}: {e}")
                continue
        
        return None
    
    def _parse_device_info(self, response_text: str, ip: str) -> Dict:
        """Parse device info response"""
        info = {
            'ip': ip,
            'mac': 'unknown',
            'model': 'unknown',
            'serial': 'unknown',
            'firmware': 'unknown',
            'name': f'axis-{ip}'
        }
        
        # Parse key-value pairs
        for line in response_text.split('\n'):
            if '=' in line:
                key, value = line.split('=', 1)
                key = key.strip().lower()
                value = value.strip()
                
                if key == 'macaddress':
                    info['mac'] = value
                elif key == 'model':
                    info['model'] = value
                elif key == 'serialnumber':
                    info['serial'] = value
                elif key == 'version':
                    info['firmware'] = value
                elif key == 'hostname':
                    info['name'] = value
        
        return info
    
    def _create_digest_auth(self, headers: Dict) -> str:
        """Create digest authentication header"""
        www_auth = headers.get('WWW-Authenticate', '')
        if not www_auth.startswith('Digest'):
            return ''
        
        # Parse digest auth parameters
        auth_params = {}
        parts = www_auth[7:].split(',')
        for part in parts:
            if '=' in part:
                key, value = part.split('=', 1)
                auth_params[key.strip()] = value.strip().strip('"')
        
        # Calculate response
        realm = auth_params.get('realm', '')
        nonce = auth_params.get('nonce', '')
        uri = auth_params.get('uri', '/')
        qop = auth_params.get('qop', '')
        
        ha1 = hashlib.md5(f"{self.username}:{realm}:{self.password}".encode()).hexdigest()
        ha2 = hashlib.md5(f"GET:{uri}".encode()).hexdigest()
        
        if qop:
            nc = '00000001'
            cnonce = hashlib.md5(str(time.time()).encode()).hexdigest()
            response = hashlib.md5(f"{ha1}:{nonce}:{nc}:{cnonce}:{qop}:{ha2}".encode()).hexdigest()
            
            return f'Digest username="{self.username}", realm="{realm}", nonce="{nonce}", uri="{uri}", qop={qop}, nc={nc}, cnonce="{cnonce}", response="{response}"'
        else:
            response = hashlib.md5(f"{ha1}:{nonce}:{ha2}".encode()).hexdigest()
            return f'Digest username="{self.username}", realm="{realm}", nonce="{nonce}", uri="{uri}", response="{response}"'
    
    async def _get_capabilities(self, ip: str) -> Dict:
        """Get camera capabilities"""
        capabilities = {
            'rtsp': False,
            'onvif': False,
            'motion_detection': False,
            'audio': False,
            'ptz': False,
            'analytics': False
        }
        
        # Check various capability endpoints
        capability_urls = [
            (f"http://{ip}/axis-cgi/streamprofile.cgi", 'rtsp'),
            (f"http://{ip}/onvif/device_service", 'onvif'),
            (f"http://{ip}/axis-cgi/motion/motiondata.cgi", 'motion_detection'),
            (f"http://{ip}/axis-cgi/audio/audiodata.cgi", 'audio'),
            (f"http://{ip}/axis-cgi/com/ptz.cgi", 'ptz'),
            (f"http://{ip}/axis-cgi/analytics/analytics.cgi", 'analytics')
        ]
        
        async with aiohttp.ClientSession() as session:
            for url, capability in capability_urls:
                try:
                    async with session.get(
                        url,
                        timeout=aiohttp.ClientTimeout(total=2),
                        ssl=False
                    ) as response:
                        if response.status in [200, 401]:
                            capabilities[capability] = True
                except:
                    pass
        
        return capabilities
    
    async def _discover_rtsp_url(self, ip: str) -> Optional[str]:
        """Discover RTSP stream URL"""
        common_rtsp_paths = [
            '/axis-media/media.amp',
            '/mpeg4/media.amp',
            '/h264/media.amp',
            '/stream1',
            '/live/stream1',
            '/MediaInput/stream_1'
        ]
        
        for path in common_rtsp_paths:
            rtsp_url = f"rtsp://{self.username}:{self.password}@{ip}{path}"
            if await self._test_rtsp_url(rtsp_url):
                return rtsp_url
        
        return None
    
    async def _test_rtsp_url(self, url: str) -> bool:
        """Test if RTSP URL is valid"""
        try:
            # Simple RTSP OPTIONS request
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(
                    urlparse(url).hostname,
                    urlparse(url).port or 554
                ),
                timeout=2
            )
            
            writer.write(f"OPTIONS {url} RTSP/1.0\r\nCSeq: 1\r\n\r\n".encode())
            await writer.drain()
            
            response = await asyncio.wait_for(reader.read(1024), timeout=2)
            writer.close()
            await writer.wait_closed()
            
            return b'RTSP/1.0 200' in response
        except:
            return False
    
    async def _discover_websocket_url(self, ip: str) -> Optional[str]:
        """Discover WebSocket endpoint"""
        websocket_paths = [
            '/ws',
            '/websocket',
            '/axis-cgi/websocket',
            '/rtsp-over-websocket'
        ]
        
        for path in websocket_paths:
            for protocol in ['ws', 'wss']:
                url = f"{protocol}://{ip}{path}"
                if await self._test_websocket_url(url):
                    return url
        
        return None
    
    async def _test_websocket_url(self, url: str) -> bool:
        """Test if WebSocket URL is valid"""
        try:
            import websockets
            async with websockets.connect(
                url,
                timeout=2,
                extra_headers={
                    'Authorization': self._create_basic_auth()
                }
            ) as websocket:
                await websocket.close()
                return True
        except:
            return False
    
    def _create_basic_auth(self) -> str:
        """Create basic auth header"""
        import base64
        credentials = base64.b64encode(
            f"{self.username}:{self.password}".encode()
        ).decode()
        return f"Basic {credentials}"
    
    def save_discovered_cameras(self, filename: str = 'discovered_cameras.json'):
        """Save discovered cameras to file"""
        data = {
            'timestamp': time.time(),
            'cameras': [camera.to_dict() for camera in self.discovered_cameras.values()]
        }
        
        with open(filename, 'w') as f:
            json.dump(data, f, indent=2)
        
        logger.info(f"Saved {len(self.discovered_cameras)} cameras to {filename}")


async def main():
    """Main discovery function"""
    import sys
    
    username = sys.argv[1] if len(sys.argv) > 1 else 'root'
    password = sys.argv[2] if len(sys.argv) > 2 else 'admin'
    network = sys.argv[3] if len(sys.argv) > 3 else '192.168.1.0/24'
    
    discovery = CameraDiscovery(username, password)
    
    logger.info(f"Starting camera discovery on network {network}")
    cameras = await discovery.discover_cameras(network)
    
    logger.info(f"Discovered {len(cameras)} cameras:")
    for camera in cameras:
        logger.info(f"  - {camera.name} ({camera.model}) at {camera.ip}")
        logger.info(f"    MAC: {camera.mac}")
        logger.info(f"    RTSP: {camera.rtsp_url}")
        logger.info(f"    WebSocket: {camera.websocket_url}")
        logger.info(f"    Capabilities: {camera.capabilities}")
    
    discovery.save_discovered_cameras()


if __name__ == '__main__':
    asyncio.run(main())