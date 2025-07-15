#!/usr/bin/env python3
"""
Dynamic PWA Configuration System for Anava Vision
Enables runtime configuration without rebuilds
"""

import json
import asyncio
import aiohttp
from aiohttp import web
import logging
import time
import hashlib
from typing import Dict, List, Optional, Any
from pathlib import Path
import jwt
import datetime
import aiofiles
from dataclasses import dataclass, asdict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@dataclass
class PWAConfig:
    """PWA Configuration"""
    app_name: str = "Anava Vision"
    app_version: str = "2.3.31"
    api_endpoint: str = ""
    websocket_endpoint: str = ""
    cameras: List[Dict] = None
    features: Dict[str, bool] = None
    theme: Dict[str, str] = None
    auth: Dict[str, Any] = None
    cache_strategy: str = "network-first"
    update_interval: int = 300  # 5 minutes
    
    def __post_init__(self):
        if self.cameras is None:
            self.cameras = []
        if self.features is None:
            self.features = {
                'live_view': True,
                'recording': True,
                'motion_detection': True,
                'analytics': True,
                'ptz': True,
                'audio': True
            }
        if self.theme is None:
            self.theme = {
                'primary_color': '#007AFF',
                'secondary_color': '#5856D6',
                'background': '#FFFFFF',
                'text': '#000000'
            }
        if self.auth is None:
            self.auth = {
                'type': 'jwt',
                'endpoint': '/api/auth',
                'refresh_interval': 3600
            }


class DynamicPWAConfigurator:
    """Manages dynamic PWA configuration"""
    
    def __init__(self, port: int = 8080):
        self.port = port
        self.app = web.Application()
        self.config = PWAConfig()
        self.config_version = 0
        self.config_hash = ''
        self.jwt_secret = hashlib.sha256(str(time.time()).encode()).hexdigest()
        self._setup_routes()
        
    def _setup_routes(self):
        """Setup API routes"""
        self.app.router.add_get('/api/config', self.get_config)
        self.app.router.add_post('/api/config', self.update_config)
        self.app.router.add_get('/api/config/version', self.get_config_version)
        self.app.router.add_get('/api/cameras', self.get_cameras)
        self.app.router.add_post('/api/cameras', self.update_cameras)
        self.app.router.add_get('/api/health', self.health_check)
        self.app.router.add_post('/api/auth/token', self.generate_token)
        self.app.router.add_get('/config.js', self.serve_config_js)
        self.app.router.add_get('/service-worker.js', self.serve_service_worker)
        self.app.router.add_get('/manifest.json', self.serve_manifest)
        
        # CORS middleware
        self.app.middlewares.append(self.cors_middleware)
    
    @web.middleware
    async def cors_middleware(self, request, handler):
        """Handle CORS"""
        response = await handler(request)
        response.headers['Access-Control-Allow-Origin'] = '*'
        response.headers['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS'
        response.headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        return response
    
    async def get_config(self, request):
        """Get current configuration"""
        return web.json_response({
            'config': asdict(self.config),
            'version': self.config_version,
            'hash': self.config_hash
        })
    
    async def update_config(self, request):
        """Update configuration"""
        try:
            data = await request.json()
            
            # Update config fields
            for key, value in data.items():
                if hasattr(self.config, key):
                    setattr(self.config, key, value)
            
            # Update version and hash
            self.config_version += 1
            self.config_hash = self._calculate_config_hash()
            
            # Notify all connected clients
            await self._broadcast_config_update()
            
            return web.json_response({
                'success': True,
                'version': self.config_version,
                'hash': self.config_hash
            })
        except Exception as e:
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=400)
    
    async def get_config_version(self, request):
        """Get config version for polling"""
        return web.json_response({
            'version': self.config_version,
            'hash': self.config_hash
        })
    
    async def get_cameras(self, request):
        """Get camera list"""
        return web.json_response({
            'cameras': self.config.cameras
        })
    
    async def update_cameras(self, request):
        """Update camera list"""
        try:
            data = await request.json()
            self.config.cameras = data.get('cameras', [])
            
            # Update version
            self.config_version += 1
            self.config_hash = self._calculate_config_hash()
            
            # Notify clients
            await self._broadcast_config_update()
            
            return web.json_response({
                'success': True,
                'camera_count': len(self.config.cameras)
            })
        except Exception as e:
            return web.json_response({
                'success': False,
                'error': str(e)
            }, status=400)
    
    async def health_check(self, request):
        """Health check endpoint"""
        return web.json_response({
            'status': 'healthy',
            'timestamp': time.time(),
            'version': self.config_version,
            'uptime': time.time() - self.start_time if hasattr(self, 'start_time') else 0
        })
    
    async def generate_token(self, request):
        """Generate JWT token"""
        try:
            data = await request.json()
            username = data.get('username')
            password = data.get('password')
            
            # Simple auth check (should be replaced with real auth)
            if username and password:
                payload = {
                    'username': username,
                    'exp': datetime.datetime.utcnow() + datetime.timedelta(hours=24),
                    'iat': datetime.datetime.utcnow()
                }
                
                token = jwt.encode(payload, self.jwt_secret, algorithm='HS256')
                
                return web.json_response({
                    'token': token,
                    'expires_in': 86400  # 24 hours
                })
            else:
                return web.json_response({
                    'error': 'Invalid credentials'
                }, status=401)
        except Exception as e:
            return web.json_response({
                'error': str(e)
            }, status=400)
    
    async def serve_config_js(self, request):
        """Serve dynamic config.js for PWA"""
        config_js = f"""
// Anava Vision Dynamic Configuration
// Generated at: {datetime.datetime.utcnow().isoformat()}
// Version: {self.config_version}

window.ANAVA_CONFIG = {json.dumps(asdict(self.config), indent=2)};

window.ANAVA_CONFIG_VERSION = {self.config_version};
window.ANAVA_CONFIG_HASH = "{self.config_hash}";

// Auto-update configuration
(function() {{
    let lastVersion = window.ANAVA_CONFIG_VERSION;
    
    async function checkConfigUpdate() {{
        try {{
            const response = await fetch('/api/config/version');
            const data = await response.json();
            
            if (data.version > lastVersion) {{
                console.log('Configuration updated, reloading...');
                const configResponse = await fetch('/api/config');
                const configData = await configResponse.json();
                
                window.ANAVA_CONFIG = configData.config;
                window.ANAVA_CONFIG_VERSION = configData.version;
                window.ANAVA_CONFIG_HASH = configData.hash;
                lastVersion = configData.version;
                
                // Dispatch event for app to handle
                window.dispatchEvent(new CustomEvent('config-updated', {{
                    detail: configData
                }}));
            }}
        }} catch (error) {{
            console.error('Failed to check config update:', error);
        }}
    }}
    
    // Check for updates every 30 seconds
    setInterval(checkConfigUpdate, 30000);
    
    // Initial check
    checkConfigUpdate();
}})();
"""
        return web.Response(
            text=config_js,
            content_type='application/javascript',
            headers={
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        )
    
    async def serve_service_worker(self, request):
        """Serve dynamic service worker"""
        sw_js = f"""
// Anava Vision Service Worker
// Version: {self.config_version}

const CACHE_NAME = 'anava-vision-v{self.config_version}';
const CONFIG_CACHE_NAME = 'anava-config-v{self.config_version}';

// Files to cache
const urlsToCache = [
    '/',
    '/index.html',
    '/static/css/main.css',
    '/static/js/main.js',
    '/manifest.json'
];

// Install event
self.addEventListener('install', event => {{
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(urlsToCache))
    );
}});

// Activate event
self.addEventListener('activate', event => {{
    event.waitUntil(
        caches.keys().then(cacheNames => {{
            return Promise.all(
                cacheNames.map(cacheName => {{
                    if (cacheName !== CACHE_NAME && cacheName !== CONFIG_CACHE_NAME) {{
                        return caches.delete(cacheName);
                    }}
                }})
            );
        }})
    );
}});

// Fetch event with dynamic config handling
self.addEventListener('fetch', event => {{
    const url = new URL(event.request.url);
    
    // Special handling for config endpoints
    if (url.pathname === '/config.js' || url.pathname.startsWith('/api/config')) {{
        event.respondWith(
            fetch(event.request)
                .then(response => {{
                    // Clone the response
                    const responseToCache = response.clone();
                    
                    caches.open(CONFIG_CACHE_NAME)
                        .then(cache => {{
                            cache.put(event.request, responseToCache);
                        }});
                    
                    return response;
                }})
                .catch(() => {{
                    // Fallback to cache
                    return caches.match(event.request);
                }})
        );
        return;
    }}
    
    // Cache strategy: {self.config.cache_strategy}
    if ('{self.config.cache_strategy}' === 'network-first') {{
        event.respondWith(
            fetch(event.request)
                .then(response => {{
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => {{
                            cache.put(event.request, responseToCache);
                        }});
                    return response;
                }})
                .catch(() => caches.match(event.request))
        );
    }} else {{
        // Cache first
        event.respondWith(
            caches.match(event.request)
                .then(response => {{
                    return response || fetch(event.request);
                }})
        );
    }}
}});

// Listen for messages from the app
self.addEventListener('message', event => {{
    if (event.data && event.data.type === 'SKIP_WAITING') {{
        self.skipWaiting();
    }}
}});
"""
        return web.Response(
            text=sw_js,
            content_type='application/javascript',
            headers={
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Service-Worker-Allowed': '/'
            }
        )
    
    async def serve_manifest(self, request):
        """Serve dynamic manifest.json"""
        manifest = {
            "name": self.config.app_name,
            "short_name": "Anava Vision",
            "description": "Advanced Video Analytics Platform",
            "version": self.config.app_version,
            "display": "standalone",
            "orientation": "any",
            "theme_color": self.config.theme['primary_color'],
            "background_color": self.config.theme['background'],
            "icons": [
                {
                    "src": "/icons/icon-192.png",
                    "sizes": "192x192",
                    "type": "image/png"
                },
                {
                    "src": "/icons/icon-512.png",
                    "sizes": "512x512",
                    "type": "image/png"
                }
            ],
            "start_url": "/",
            "scope": "/",
            "categories": ["security", "productivity"],
            "screenshots": [],
            "shortcuts": [
                {
                    "name": "Live View",
                    "url": "/live",
                    "description": "View live camera feeds"
                },
                {
                    "name": "Analytics",
                    "url": "/analytics",
                    "description": "View analytics dashboard"
                }
            ]
        }
        
        return web.json_response(
            manifest,
            headers={
                'Cache-Control': 'public, max-age=3600'
            }
        )
    
    def _calculate_config_hash(self) -> str:
        """Calculate config hash"""
        config_str = json.dumps(asdict(self.config), sort_keys=True)
        return hashlib.sha256(config_str.encode()).hexdigest()[:8]
    
    async def _broadcast_config_update(self):
        """Broadcast config update to connected clients"""
        # This would use WebSocket in production
        logger.info(f"Broadcasting config update v{self.config_version}")
    
    async def load_camera_config(self, camera_file: str = 'discovered_cameras.json',
                                 websocket_file: str = 'websocket_config.json'):
        """Load camera and WebSocket configurations"""
        try:
            # Load discovered cameras
            async with aiofiles.open(camera_file, 'r') as f:
                camera_data = json.loads(await f.read())
                cameras = camera_data.get('cameras', [])
            
            # Load WebSocket configs
            async with aiofiles.open(websocket_file, 'r') as f:
                ws_data = json.loads(await f.read())
                ws_endpoints = {ep['url'].split('/')[2].split(':')[0]: ep 
                               for ep in ws_data.get('endpoints', [])}
            
            # Combine configurations
            configured_cameras = []
            for camera in cameras:
                camera_config = {
                    'id': camera['serial'],
                    'name': camera['name'],
                    'ip': camera['ip'],
                    'model': camera['model'],
                    'capabilities': camera.get('capabilities', {}),
                    'rtsp_url': camera.get('rtsp_url', ''),
                    'websocket_url': ''
                }
                
                # Add WebSocket config if available
                if camera['ip'] in ws_endpoints:
                    ws_config = ws_endpoints[camera['ip']]
                    if ws_config.get('validated'):
                        camera_config['websocket_url'] = ws_config['url']
                
                configured_cameras.append(camera_config)
            
            self.config.cameras = configured_cameras
            self.config_version += 1
            self.config_hash = self._calculate_config_hash()
            
            logger.info(f"Loaded {len(configured_cameras)} camera configurations")
            
        except Exception as e:
            logger.error(f"Failed to load camera config: {e}")
    
    async def start_server(self):
        """Start the configuration server"""
        self.start_time = time.time()
        
        # Load initial configuration
        await self.load_camera_config()
        
        runner = web.AppRunner(self.app)
        await runner.setup()
        site = web.TCPSite(runner, '0.0.0.0', self.port)
        
        logger.info(f"Starting Dynamic PWA Config Server on port {self.port}")
        await site.start()
        
        # Keep server running
        try:
            await asyncio.Event().wait()
        except KeyboardInterrupt:
            logger.info("Shutting down server...")
            await runner.cleanup()


async def main():
    """Main function"""
    configurator = DynamicPWAConfigurator(port=8080)
    await configurator.start_server()


if __name__ == '__main__':
    asyncio.run(main())