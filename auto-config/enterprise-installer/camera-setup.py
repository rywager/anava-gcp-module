#!/usr/bin/env python3
"""
Anava Vision Camera Setup Tool
Quick camera configuration and testing utility
"""

import asyncio
import aiohttp
import sys
import json
import yaml
from pathlib import Path
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse
from aiohttp_digest_auth import DigestAuth
import argparse

class CameraSetup:
    """Camera setup and testing utility"""
    
    def __init__(self):
        self.config_path = Path("/etc/anava-vision/cameras.yaml")
        
    async def test_camera(self, ip: str, username: str, password: str, port: int = 80):
        """Test camera connectivity and authentication"""
        print(f"\nTesting camera at {ip}:{port}")
        print("-" * 40)
        
        try:
            timeout = aiohttp.ClientTimeout(total=10)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                # Test digest auth
                auth = DigestAuth(username, password, session)
                
                # Try to get device info
                test_urls = [
                    f"http://{ip}:{port}/axis-cgi/param.cgi?action=list&group=root.Brand",
                    f"http://{ip}:{port}/axis-cgi/basicdeviceinfo.cgi",
                    f"http://{ip}:{port}/"
                ]
                
                for url in test_urls:
                    try:
                        print(f"Testing {url}...")
                        async with session.get(url, auth=auth) as resp:
                            if resp.status == 200:
                                print(f"✓ Success! Status: {resp.status}")
                                content = await resp.text()
                                
                                # Parse device info if available
                                if "root.Brand" in content:
                                    lines = content.split('\n')
                                    info = {}
                                    for line in lines:
                                        if '=' in line:
                                            key, value = line.split('=', 1)
                                            info[key] = value.strip()
                                    
                                    print(f"\nDevice Information:")
                                    print(f"  Model: {info.get('root.Brand.ProdNbr', 'Unknown')}")
                                    print(f"  Brand: {info.get('root.Brand.Brand', 'Axis')}")
                                    print(f"  Type: {info.get('root.Brand.ProdType', 'Network Camera')}")
                                
                                # Test RTSP URL
                                rtsp_url = f"rtsp://{username}:{password}@{ip}:554/axis-media/media.amp"
                                print(f"\nRTSP URL: {rtsp_url}")
                                
                                return {
                                    'success': True,
                                    'ip': ip,
                                    'port': port,
                                    'rtsp_url': rtsp_url,
                                    'auth_type': 'digest',
                                    'info': info if 'info' in locals() else {}
                                }
                            else:
                                print(f"✗ Failed with status: {resp.status}")
                    except Exception as e:
                        print(f"✗ Error: {str(e)}")
                        continue
                
                return {
                    'success': False,
                    'error': 'Failed to authenticate or connect'
                }
                
        except Exception as e:
            print(f"✗ Connection error: {str(e)}")
            return {
                'success': False,
                'error': str(e)
            }
    
    async def add_camera(self, ip: str, username: str, password: str, name: Optional[str] = None, port: int = 80):
        """Add a camera to the configuration"""
        
        # Test camera first
        result = await self.test_camera(ip, username, password, port)
        
        if not result['success']:
            print(f"\n❌ Failed to add camera: {result['error']}")
            return False
        
        # Load existing configuration
        cameras = []
        if self.config_path.exists():
            with open(self.config_path, 'r') as f:
                data = yaml.safe_load(f) or {}
                cameras = data.get('cameras', [])
        
        # Generate camera ID
        import hashlib
        camera_id = hashlib.md5(f"{ip}:{port}".encode()).hexdigest()[:8]
        
        # Check if camera already exists
        for cam in cameras:
            if cam['ip'] == ip and cam['port'] == port:
                print(f"\n⚠️  Camera already exists with ID: {cam['id']}")
                return True
        
        # Create camera entry
        camera = {
            'id': camera_id,
            'name': name or f"Camera-{camera_id}",
            'ip': ip,
            'port': port,
            'username': username,
            'password': password,
            'rtsp_url': result['rtsp_url'],
            'model': result['info'].get('root.Brand.ProdNbr', 'Unknown'),
            'manufacturer': 'Axis',
            'mac_address': '00:00:00:00:00:00',
            'firmware_version': result['info'].get('root.Brand.Version', 'Unknown'),
            'discovered_at': datetime.now().isoformat(),
            'last_seen': datetime.now().isoformat(),
            'capabilities': ['rtsp', 'digest_auth', 'h264'],
            'status': 'online',
            'auth_type': 'digest'
        }
        
        cameras.append(camera)
        
        # Save configuration
        self.config_path.parent.mkdir(parents=True, exist_ok=True)
        
        config_data = {
            'cameras': cameras,
            'last_updated': datetime.now().isoformat()
        }
        
        with open(self.config_path, 'w') as f:
            yaml.dump(config_data, f, default_flow_style=False)
        
        print(f"\n✅ Camera added successfully!")
        print(f"   ID: {camera_id}")
        print(f"   Name: {camera['name']}")
        print(f"   RTSP URL: {camera['rtsp_url']}")
        
        return True
    
    def list_cameras(self):
        """List all configured cameras"""
        if not self.config_path.exists():
            print("No cameras configured yet.")
            return
        
        with open(self.config_path, 'r') as f:
            data = yaml.safe_load(f) or {}
            cameras = data.get('cameras', [])
        
        if not cameras:
            print("No cameras configured yet.")
            return
        
        print(f"\nConfigured Cameras ({len(cameras)} total):")
        print("-" * 80)
        print(f"{'ID':<10} {'Name':<20} {'IP Address':<15} {'Status':<10} {'Model':<20}")
        print("-" * 80)
        
        for cam in cameras:
            print(f"{cam['id']:<10} {cam['name']:<20} {cam['ip']:<15} {cam['status']:<10} {cam['model']:<20}")
    
    def remove_camera(self, camera_id: str):
        """Remove a camera from configuration"""
        if not self.config_path.exists():
            print("No cameras configured.")
            return
        
        with open(self.config_path, 'r') as f:
            data = yaml.safe_load(f) or {}
            cameras = data.get('cameras', [])
        
        # Find and remove camera
        original_count = len(cameras)
        cameras = [c for c in cameras if c['id'] != camera_id]
        
        if len(cameras) == original_count:
            print(f"Camera with ID '{camera_id}' not found.")
            return
        
        # Save updated configuration
        config_data = {
            'cameras': cameras,
            'last_updated': datetime.now().isoformat()
        }
        
        with open(self.config_path, 'w') as f:
            yaml.dump(config_data, f, default_flow_style=False)
        
        print(f"✅ Camera '{camera_id}' removed successfully.")

async def main():
    parser = argparse.ArgumentParser(description='Anava Vision Camera Setup Tool')
    subparsers = parser.add_subparsers(dest='command', help='Commands')
    
    # Add camera command
    add_parser = subparsers.add_parser('add', help='Add a new camera')
    add_parser.add_argument('ip', help='Camera IP address')
    add_parser.add_argument('-u', '--username', default='root', help='Username (default: root)')
    add_parser.add_argument('-p', '--password', default='pass', help='Password (default: pass)')
    add_parser.add_argument('-P', '--port', type=int, default=80, help='HTTP port (default: 80)')
    add_parser.add_argument('-n', '--name', help='Camera name')
    
    # Test camera command
    test_parser = subparsers.add_parser('test', help='Test camera connectivity')
    test_parser.add_argument('ip', help='Camera IP address')
    test_parser.add_argument('-u', '--username', default='root', help='Username (default: root)')
    test_parser.add_argument('-p', '--password', default='pass', help='Password (default: pass)')
    test_parser.add_argument('-P', '--port', type=int, default=80, help='HTTP port (default: 80)')
    
    # List cameras command
    list_parser = subparsers.add_parser('list', help='List all configured cameras')
    
    # Remove camera command
    remove_parser = subparsers.add_parser('remove', help='Remove a camera')
    remove_parser.add_argument('id', help='Camera ID to remove')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    setup = CameraSetup()
    
    if args.command == 'add':
        await setup.add_camera(args.ip, args.username, args.password, args.name, args.port)
    elif args.command == 'test':
        await setup.test_camera(args.ip, args.username, args.password, args.port)
    elif args.command == 'list':
        setup.list_cameras()
    elif args.command == 'remove':
        setup.remove_camera(args.id)

if __name__ == "__main__":
    asyncio.run(main())