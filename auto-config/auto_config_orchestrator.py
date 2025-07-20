#!/usr/bin/env python3
"""
Auto-Configuration Orchestrator for Anava Vision
Coordinates all auto-configuration components
"""

import asyncio
import logging
import json
import sys
from pathlib import Path
from typing import Dict, List, Optional
import signal
import argparse
from datetime import datetime

from camera_discovery import CameraDiscovery
from websocket_configurator import WebSocketConfigurator
from dynamic_pwa_config import DynamicPWAConfigurator
from certificate_manager import CertificateManager
from health_monitor import HealthMonitor

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class AutoConfigOrchestrator:
    """Orchestrates the auto-configuration process"""
    
    def __init__(self, username: str, password: str, network_range: str = None):
        self.username = username
        self.password = password
        self.network_range = network_range or '192.168.1.0/24'
        self.components = {}
        self.running = False
        
    async def initialize_components(self):
        """Initialize all components"""
        logger.info("Initializing auto-configuration components...")
        
        # Initialize components
        self.components['discovery'] = CameraDiscovery(self.username, self.password)
        self.components['websocket'] = WebSocketConfigurator(self.username, self.password)
        self.components['pwa_config'] = DynamicPWAConfigurator(port=8080)
        self.components['certificates'] = CertificateManager()
        self.components['health'] = HealthMonitor()
        
        logger.info("All components initialized successfully")
    
    async def run_discovery_phase(self) -> List[Dict]:
        """Run camera discovery phase"""
        logger.info("=" * 50)
        logger.info("PHASE 1: Camera Discovery")
        logger.info("=" * 50)
        
        discovery = self.components['discovery']
        
        # Discover cameras
        logger.info(f"Scanning network {self.network_range} for Axis cameras...")
        cameras = await discovery.discover_cameras(self.network_range)
        
        if not cameras:
            logger.warning("No cameras discovered. Please check network and credentials.")
            return []
        
        logger.info(f"Discovered {len(cameras)} cameras")
        
        # Save discovery results
        discovery.save_discovered_cameras()
        
        # Display discovered cameras
        for camera in cameras:
            logger.info(f"  • {camera.name} ({camera.model})")
            logger.info(f"    - IP: {camera.ip}")
            logger.info(f"    - MAC: {camera.mac}")
            logger.info(f"    - Serial: {camera.serial}")
            logger.info(f"    - RTSP: {camera.rtsp_url or 'Not found'}")
        
        return [camera.to_dict() for camera in cameras]
    
    async def run_websocket_configuration(self, cameras: List[Dict]) -> Dict:
        """Configure WebSocket endpoints"""
        logger.info("=" * 50)
        logger.info("PHASE 2: WebSocket Configuration")
        logger.info("=" * 50)
        
        configurator = self.components['websocket']
        
        # Configure WebSocket for each camera
        configs = await configurator.auto_configure_camera_websockets(cameras)
        
        logger.info(f"Configured {len(configs)} WebSocket endpoints")
        
        # Test stream quality for each endpoint
        for ip, config in configs.items():
            logger.info(f"  • Camera {ip}:")
            logger.info(f"    - WebSocket: {config.url}")
            logger.info(f"    - Latency: {config.latency:.1f}ms")
            
            # Test stream quality
            quality = await configurator.test_stream_quality(config)
            logger.info(f"    - Stream Quality: {quality.get('fps', 0):.1f} fps, "
                       f"{quality.get('bitrate', 0):.1f} Kbps")
        
        # Save configuration
        configurator.save_configuration()
        
        return configs
    
    async def run_certificate_scan(self, cameras: List[Dict]) -> Dict:
        """Scan and manage certificates"""
        logger.info("=" * 50)
        logger.info("PHASE 3: Certificate Management")
        logger.info("=" * 50)
        
        cert_manager = self.components['certificates']
        
        # Scan certificates
        cert_info = await cert_manager.scan_camera_certificates(cameras)
        
        logger.info(f"Scanned {len(cert_info)} certificates")
        
        # Display certificate information
        for host, cert in cert_info.items():
            logger.info(f"  • {host}:")
            logger.info(f"    - Subject: {cert.subject}")
            logger.info(f"    - Issuer: {cert.issuer}")
            logger.info(f"    - Valid: {cert.is_valid}")
            if cert.is_self_signed:
                logger.info(f"    - Self-signed: Yes")
            logger.info(f"    - Expires: {cert.not_after.strftime('%Y-%m-%d')}")
        
        # Create CA bundle
        ca_bundle = await cert_manager.create_ca_bundle()
        logger.info(f"Created CA bundle: {ca_bundle}")
        
        # Check for expiring certificates
        expiring = await cert_manager.monitor_certificate_expiry(cameras, warning_days=30)
        if expiring:
            logger.warning(f"{len(expiring)} certificates expiring within 30 days")
        
        # Save certificate report
        await cert_manager.save_certificate_report(cert_info)
        
        return cert_info
    
    async def start_pwa_config_server(self):
        """Start PWA configuration server"""
        logger.info("=" * 50)
        logger.info("PHASE 4: Starting PWA Configuration Server")
        logger.info("=" * 50)
        
        pwa_config = self.components['pwa_config']
        
        # Load camera configurations
        await pwa_config.load_camera_config()
        
        # Start server in background
        asyncio.create_task(pwa_config.start_server())
        
        # Wait for server to start
        await asyncio.sleep(2)
        
        logger.info(f"PWA Configuration Server started on port {pwa_config.port}")
        logger.info(f"  • Config API: http://localhost:{pwa_config.port}/api/config")
        logger.info(f"  • Health Check: http://localhost:{pwa_config.port}/api/health")
        logger.info(f"  • Dynamic config.js: http://localhost:{pwa_config.port}/config.js")
        logger.info(f"  • Service Worker: http://localhost:{pwa_config.port}/service-worker.js")
    
    async def start_health_monitoring(self):
        """Start health monitoring"""
        logger.info("=" * 50)
        logger.info("PHASE 5: Starting Health Monitoring")
        logger.info("=" * 50)
        
        health_monitor = self.components['health']
        
        # Start monitoring in background
        asyncio.create_task(health_monitor.start_monitoring())
        
        logger.info("Health monitoring started")
        logger.info("Monitoring:")
        for check_name in health_monitor.health_checks.keys():
            logger.info(f"  • {check_name}")
    
    async def display_status(self):
        """Display current system status"""
        while self.running:
            await asyncio.sleep(60)  # Update every minute
            
            try:
                # Get health status
                health_monitor = self.components['health']
                health_status = await health_monitor.get_health_status()
                
                logger.info("=" * 50)
                logger.info(f"System Status - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
                logger.info("=" * 50)
                logger.info(f"Overall Health: {health_status['overall_status']}")
                
                # Display individual check statuses
                for check_name, check_info in health_status['checks'].items():
                    status = check_info['status']
                    symbol = "✓" if status == "healthy" else "✗" if status in ["unhealthy", "critical"] else "!"
                    logger.info(f"  {symbol} {check_name}: {status}")
                
                # Display metrics
                if health_status.get('metrics'):
                    metrics = health_status['metrics']
                    logger.info(f"\nSystem Metrics:")
                    logger.info(f"  • CPU: {metrics['cpu_percent']:.1f}%")
                    logger.info(f"  • Memory: {metrics['memory_percent']:.1f}%")
                    logger.info(f"  • Disk: {metrics['disk_percent']:.1f}%")
                
            except Exception as e:
                logger.error(f"Error displaying status: {e}")
    
    async def run(self):
        """Run the auto-configuration orchestrator"""
        self.running = True
        
        try:
            # Initialize components
            await self.initialize_components()
            
            # Phase 1: Discovery
            cameras = await self.run_discovery_phase()
            if not cameras:
                logger.error("No cameras found. Exiting.")
                return
            
            # Phase 2: WebSocket Configuration
            await self.run_websocket_configuration(cameras)
            
            # Phase 3: Certificate Management
            await self.run_certificate_scan(cameras)
            
            # Phase 4: Start PWA Config Server
            await self.start_pwa_config_server()
            
            # Phase 5: Start Health Monitoring
            await self.start_health_monitoring()
            
            # Display summary
            logger.info("=" * 50)
            logger.info("Auto-Configuration Complete!")
            logger.info("=" * 50)
            logger.info(f"✓ Discovered {len(cameras)} cameras")
            logger.info(f"✓ Configured WebSocket endpoints")
            logger.info(f"✓ Scanned and managed certificates")
            logger.info(f"✓ PWA configuration server running")
            logger.info(f"✓ Health monitoring active")
            
            logger.info("\nSystem is now fully configured and monitored.")
            logger.info("Press Ctrl+C to stop.")
            
            # Start status display
            await self.display_status()
            
        except KeyboardInterrupt:
            logger.info("\nShutting down...")
            self.running = False
        except Exception as e:
            logger.error(f"Orchestrator error: {e}")
            raise
        finally:
            # Save final reports
            try:
                health_monitor = self.components.get('health')
                if health_monitor:
                    await health_monitor.save_health_report()
            except:
                pass
    
    def handle_shutdown(self, signum, frame):
        """Handle shutdown signal"""
        logger.info("Received shutdown signal")
        self.running = False


def main():
    """Main entry point"""
    parser = argparse.ArgumentParser(
        description='Anava Vision Auto-Configuration System'
    )
    parser.add_argument(
        '--username', '-u',
        default='root',
        help='Camera username (default: root)'
    )
    parser.add_argument(
        '--password', '-p',
        default='admin',
        help='Camera password (default: admin)'
    )
    parser.add_argument(
        '--network', '-n',
        default='192.168.1.0/24',
        help='Network range to scan (default: 192.168.1.0/24)'
    )
    parser.add_argument(
        '--config-file', '-c',
        help='Configuration file (JSON)'
    )
    
    args = parser.parse_args()
    
    # Load config from file if provided
    if args.config_file:
        try:
            with open(args.config_file, 'r') as f:
                config = json.load(f)
                args.username = config.get('username', args.username)
                args.password = config.get('password', args.password)
                args.network = config.get('network', args.network)
        except Exception as e:
            logger.error(f"Failed to load config file: {e}")
            sys.exit(1)
    
    # Create orchestrator
    orchestrator = AutoConfigOrchestrator(
        username=args.username,
        password=args.password,
        network_range=args.network
    )
    
    # Setup signal handlers
    signal.signal(signal.SIGINT, orchestrator.handle_shutdown)
    signal.signal(signal.SIGTERM, orchestrator.handle_shutdown)
    
    # Run orchestrator
    asyncio.run(orchestrator.run())


if __name__ == '__main__':
    main()