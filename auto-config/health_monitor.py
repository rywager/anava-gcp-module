#!/usr/bin/env python3
"""
Health Monitoring and Auto-Recovery System for Anava Vision
Monitors system health and automatically recovers from failures
"""

import asyncio
import aiohttp
import psutil
import logging
import json
import time
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import subprocess
import os
import signal
from pathlib import Path
import aiofiles

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class HealthStatus(Enum):
    """Health status levels"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    CRITICAL = "critical"
    UNKNOWN = "unknown"


@dataclass
class HealthCheck:
    """Health check configuration"""
    name: str
    check_fn: Callable
    interval: int = 30  # seconds
    timeout: int = 10
    retries: int = 3
    recovery_fn: Optional[Callable] = None
    last_check: Optional[datetime] = None
    last_status: HealthStatus = HealthStatus.UNKNOWN
    consecutive_failures: int = 0
    error_message: str = ""


@dataclass
class SystemMetrics:
    """System performance metrics"""
    timestamp: datetime
    cpu_percent: float
    memory_percent: float
    disk_percent: float
    network_io: Dict[str, int]
    process_count: int
    open_files: int
    
    def to_dict(self):
        return {
            'timestamp': self.timestamp.isoformat(),
            'cpu_percent': self.cpu_percent,
            'memory_percent': self.memory_percent,
            'disk_percent': self.disk_percent,
            'network_io': self.network_io,
            'process_count': self.process_count,
            'open_files': self.open_files
        }


class HealthMonitor:
    """Monitors system health and performs auto-recovery"""
    
    def __init__(self, config_file: str = 'health_config.json'):
        self.config_file = config_file
        self.health_checks: Dict[str, HealthCheck] = {}
        self.metrics_history: List[SystemMetrics] = []
        self.recovery_in_progress: Dict[str, bool] = {}
        self.alerts: List[Dict] = []
        self.monitoring = False
        self._load_config()
        self._setup_health_checks()
        
    def _load_config(self):
        """Load configuration from file"""
        try:
            with open(self.config_file, 'r') as f:
                self.config = json.load(f)
        except:
            self.config = {
                'thresholds': {
                    'cpu_percent': 80,
                    'memory_percent': 85,
                    'disk_percent': 90,
                    'response_time': 5000,  # ms
                    'error_rate': 0.05  # 5%
                },
                'alerts': {
                    'email': None,
                    'webhook': None,
                    'slack': None
                },
                'recovery': {
                    'auto_restart': True,
                    'max_restart_attempts': 3,
                    'restart_delay': 30  # seconds
                }
            }
    
    def _setup_health_checks(self):
        """Setup default health checks"""
        # System health checks
        self.add_health_check(HealthCheck(
            name="system_resources",
            check_fn=self._check_system_resources,
            interval=30,
            recovery_fn=self._recover_system_resources
        ))
        
        # Camera connectivity checks
        self.add_health_check(HealthCheck(
            name="camera_connectivity",
            check_fn=self._check_camera_connectivity,
            interval=60,
            recovery_fn=self._recover_camera_connectivity
        ))
        
        # WebSocket health check
        self.add_health_check(HealthCheck(
            name="websocket_health",
            check_fn=self._check_websocket_health,
            interval=30,
            recovery_fn=self._recover_websocket
        ))
        
        # Service health checks
        self.add_health_check(HealthCheck(
            name="pwa_config_service",
            check_fn=self._check_pwa_config_service,
            interval=30,
            recovery_fn=self._recover_service
        ))
        
        # Certificate validity check
        self.add_health_check(HealthCheck(
            name="certificate_validity",
            check_fn=self._check_certificates,
            interval=3600  # hourly
        ))
        
        # Network health check
        self.add_health_check(HealthCheck(
            name="network_health",
            check_fn=self._check_network_health,
            interval=60
        ))
    
    def add_health_check(self, check: HealthCheck):
        """Add a health check"""
        self.health_checks[check.name] = check
        logger.info(f"Added health check: {check.name}")
    
    async def start_monitoring(self):
        """Start health monitoring"""
        self.monitoring = True
        logger.info("Starting health monitoring...")
        
        # Start individual health check tasks
        tasks = []
        for check in self.health_checks.values():
            tasks.append(asyncio.create_task(self._run_health_check_loop(check)))
        
        # Start metrics collection
        tasks.append(asyncio.create_task(self._collect_metrics_loop()))
        
        # Start alert processing
        tasks.append(asyncio.create_task(self._process_alerts_loop()))
        
        # Wait for all tasks
        try:
            await asyncio.gather(*tasks)
        except KeyboardInterrupt:
            logger.info("Stopping health monitoring...")
            self.monitoring = False
    
    async def _run_health_check_loop(self, check: HealthCheck):
        """Run health check in a loop"""
        while self.monitoring:
            try:
                # Run the check
                status = await self._run_health_check(check)
                check.last_check = datetime.utcnow()
                check.last_status = status
                
                # Handle status changes
                if status != HealthStatus.HEALTHY:
                    check.consecutive_failures += 1
                    
                    # Trigger recovery if needed
                    if (check.recovery_fn and 
                        check.consecutive_failures >= check.retries and
                        check.name not in self.recovery_in_progress):
                        
                        asyncio.create_task(self._perform_recovery(check))
                else:
                    check.consecutive_failures = 0
                    check.error_message = ""
                
                # Log status
                logger.debug(f"Health check '{check.name}': {status.value}")
                
            except Exception as e:
                logger.error(f"Error in health check '{check.name}': {e}")
                check.last_status = HealthStatus.UNKNOWN
                check.error_message = str(e)
            
            # Wait for next interval
            await asyncio.sleep(check.interval)
    
    async def _run_health_check(self, check: HealthCheck) -> HealthStatus:
        """Run a single health check"""
        try:
            result = await asyncio.wait_for(
                check.check_fn(),
                timeout=check.timeout
            )
            return result
        except asyncio.TimeoutError:
            check.error_message = "Health check timed out"
            return HealthStatus.UNHEALTHY
        except Exception as e:
            check.error_message = str(e)
            return HealthStatus.UNHEALTHY
    
    async def _perform_recovery(self, check: HealthCheck):
        """Perform recovery action"""
        if check.name in self.recovery_in_progress:
            return
        
        self.recovery_in_progress[check.name] = True
        logger.warning(f"Performing recovery for '{check.name}'")
        
        try:
            # Create alert
            alert = {
                'timestamp': datetime.utcnow().isoformat(),
                'check_name': check.name,
                'status': check.last_status.value,
                'error': check.error_message,
                'action': 'recovery_started'
            }
            self.alerts.append(alert)
            
            # Run recovery function
            success = await check.recovery_fn(check)
            
            if success:
                logger.info(f"Recovery successful for '{check.name}'")
                alert['action'] = 'recovery_succeeded'
            else:
                logger.error(f"Recovery failed for '{check.name}'")
                alert['action'] = 'recovery_failed'
                
        except Exception as e:
            logger.error(f"Recovery error for '{check.name}': {e}")
        finally:
            self.recovery_in_progress[check.name] = False
    
    async def _check_system_resources(self) -> HealthStatus:
        """Check system resource usage"""
        cpu_percent = psutil.cpu_percent(interval=1)
        memory_percent = psutil.virtual_memory().percent
        disk_percent = psutil.disk_usage('/').percent
        
        # Check against thresholds
        if (cpu_percent > self.config['thresholds']['cpu_percent'] or
            memory_percent > self.config['thresholds']['memory_percent'] or
            disk_percent > self.config['thresholds']['disk_percent']):
            
            if cpu_percent > 95 or memory_percent > 95:
                return HealthStatus.CRITICAL
            return HealthStatus.DEGRADED
        
        return HealthStatus.HEALTHY
    
    async def _recover_system_resources(self, check: HealthCheck) -> bool:
        """Recover from high resource usage"""
        logger.info("Attempting to free system resources...")
        
        try:
            # Clear caches
            if os.name == 'posix':
                subprocess.run(['sync'], check=True)
                if os.path.exists('/proc/sys/vm/drop_caches'):
                    subprocess.run(['sudo', 'sh', '-c', 'echo 1 > /proc/sys/vm/drop_caches'], check=True)
            
            # Kill zombie processes
            for proc in psutil.process_iter(['pid', 'status']):
                if proc.info['status'] == psutil.STATUS_ZOMBIE:
                    os.kill(proc.info['pid'], signal.SIGKILL)
            
            # Force garbage collection in Python
            import gc
            gc.collect()
            
            return True
        except Exception as e:
            logger.error(f"Resource recovery failed: {e}")
            return False
    
    async def _check_camera_connectivity(self) -> HealthStatus:
        """Check camera connectivity"""
        try:
            # Load camera list
            with open('discovered_cameras.json', 'r') as f:
                camera_data = json.load(f)
                cameras = camera_data.get('cameras', [])
            
            if not cameras:
                return HealthStatus.UNKNOWN
            
            # Check each camera
            failed_cameras = 0
            for camera in cameras:
                try:
                    async with aiohttp.ClientSession() as session:
                        async with session.get(
                            f"http://{camera['ip']}/axis-cgi/basicdeviceinfo.cgi",
                            timeout=aiohttp.ClientTimeout(total=5),
                            ssl=False
                        ) as response:
                            if response.status not in [200, 401]:
                                failed_cameras += 1
                except:
                    failed_cameras += 1
            
            # Calculate health status
            failure_rate = failed_cameras / len(cameras)
            if failure_rate == 0:
                return HealthStatus.HEALTHY
            elif failure_rate < 0.1:  # Less than 10% failed
                return HealthStatus.DEGRADED
            elif failure_rate < 0.5:  # Less than 50% failed
                return HealthStatus.UNHEALTHY
            else:
                return HealthStatus.CRITICAL
                
        except Exception as e:
            logger.error(f"Camera connectivity check failed: {e}")
            return HealthStatus.UNKNOWN
    
    async def _recover_camera_connectivity(self, check: HealthCheck) -> bool:
        """Recover camera connectivity"""
        logger.info("Attempting to recover camera connectivity...")
        
        try:
            # Re-run camera discovery
            from camera_discovery import CameraDiscovery
            
            discovery = CameraDiscovery('root', 'admin')
            cameras = await discovery.discover_cameras('192.168.1.0/24')
            
            if cameras:
                discovery.save_discovered_cameras()
                logger.info(f"Rediscovered {len(cameras)} cameras")
                return True
            
            return False
        except Exception as e:
            logger.error(f"Camera recovery failed: {e}")
            return False
    
    async def _check_websocket_health(self) -> HealthStatus:
        """Check WebSocket connections"""
        try:
            # Load WebSocket configs
            with open('websocket_config.json', 'r') as f:
                ws_data = json.load(f)
                endpoints = ws_data.get('endpoints', [])
            
            if not endpoints:
                return HealthStatus.UNKNOWN
            
            # Check validated endpoints
            valid_count = sum(1 for ep in endpoints if ep.get('validated', False))
            
            if valid_count == len(endpoints):
                return HealthStatus.HEALTHY
            elif valid_count > len(endpoints) * 0.5:
                return HealthStatus.DEGRADED
            else:
                return HealthStatus.UNHEALTHY
                
        except Exception as e:
            logger.error(f"WebSocket health check failed: {e}")
            return HealthStatus.UNKNOWN
    
    async def _recover_websocket(self, check: HealthCheck) -> bool:
        """Recover WebSocket connections"""
        logger.info("Attempting to recover WebSocket connections...")
        
        try:
            # Re-run WebSocket configuration
            from websocket_configurator import WebSocketConfigurator
            
            # Load cameras
            with open('discovered_cameras.json', 'r') as f:
                camera_data = json.load(f)
                cameras = camera_data['cameras']
            
            configurator = WebSocketConfigurator('root', 'admin')
            configs = await configurator.auto_configure_camera_websockets(cameras)
            
            if configs:
                configurator.save_configuration()
                logger.info(f"Reconfigured {len(configs)} WebSocket endpoints")
                return True
            
            return False
        except Exception as e:
            logger.error(f"WebSocket recovery failed: {e}")
            return False
    
    async def _check_pwa_config_service(self) -> HealthStatus:
        """Check PWA config service"""
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    'http://localhost:8080/api/health',
                    timeout=aiohttp.ClientTimeout(total=5)
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data.get('status') == 'healthy':
                            return HealthStatus.HEALTHY
            
            return HealthStatus.UNHEALTHY
        except:
            return HealthStatus.UNHEALTHY
    
    async def _recover_service(self, check: HealthCheck) -> bool:
        """Recover a service by restarting it"""
        logger.info(f"Attempting to restart service for '{check.name}'")
        
        try:
            # Map check names to service scripts
            service_map = {
                'pwa_config_service': 'dynamic_pwa_config.py'
            }
            
            script = service_map.get(check.name)
            if not script:
                return False
            
            # Kill existing process
            for proc in psutil.process_iter(['pid', 'cmdline']):
                if script in ' '.join(proc.info['cmdline']):
                    os.kill(proc.info['pid'], signal.SIGTERM)
                    await asyncio.sleep(2)
            
            # Start new process
            subprocess.Popen([
                'python3', script
            ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            
            # Wait for service to start
            await asyncio.sleep(5)
            
            # Verify it's running
            status = await self._check_pwa_config_service()
            return status == HealthStatus.HEALTHY
            
        except Exception as e:
            logger.error(f"Service recovery failed: {e}")
            return False
    
    async def _check_certificates(self) -> HealthStatus:
        """Check certificate validity"""
        try:
            # Load certificate report
            with open('certificate_report.json', 'r') as f:
                report = json.load(f)
            
            summary = report.get('summary', {})
            
            # Check for expiring certificates
            if summary.get('expiring_soon', 0) > 0:
                return HealthStatus.DEGRADED
            
            # Check validity
            total = summary.get('total_certificates', 0)
            valid = summary.get('valid', 0)
            
            if total == 0:
                return HealthStatus.UNKNOWN
            
            validity_rate = valid / total
            if validity_rate >= 0.9:
                return HealthStatus.HEALTHY
            elif validity_rate >= 0.7:
                return HealthStatus.DEGRADED
            else:
                return HealthStatus.UNHEALTHY
                
        except Exception as e:
            logger.error(f"Certificate check failed: {e}")
            return HealthStatus.UNKNOWN
    
    async def _check_network_health(self) -> HealthStatus:
        """Check network health"""
        try:
            # Check network interfaces
            interfaces = psutil.net_if_stats()
            down_interfaces = sum(1 for iface in interfaces.values() if not iface.isup)
            
            if down_interfaces > 0:
                return HealthStatus.DEGRADED
            
            # Check packet errors
            net_io = psutil.net_io_counters()
            error_rate = (net_io.errin + net_io.errout) / (net_io.packets_sent + net_io.packets_recv)
            
            if error_rate > 0.05:  # 5% error rate
                return HealthStatus.UNHEALTHY
            elif error_rate > 0.01:  # 1% error rate
                return HealthStatus.DEGRADED
            
            return HealthStatus.HEALTHY
            
        except Exception as e:
            logger.error(f"Network health check failed: {e}")
            return HealthStatus.UNKNOWN
    
    async def _collect_metrics_loop(self):
        """Collect system metrics periodically"""
        while self.monitoring:
            try:
                metrics = SystemMetrics(
                    timestamp=datetime.utcnow(),
                    cpu_percent=psutil.cpu_percent(interval=1),
                    memory_percent=psutil.virtual_memory().percent,
                    disk_percent=psutil.disk_usage('/').percent,
                    network_io={
                        'bytes_sent': psutil.net_io_counters().bytes_sent,
                        'bytes_recv': psutil.net_io_counters().bytes_recv,
                        'packets_sent': psutil.net_io_counters().packets_sent,
                        'packets_recv': psutil.net_io_counters().packets_recv
                    },
                    process_count=len(psutil.pids()),
                    open_files=sum(1 for proc in psutil.process_iter(['open_files']) 
                                  if proc.info['open_files'])
                )
                
                self.metrics_history.append(metrics)
                
                # Keep only last hour of metrics
                cutoff_time = datetime.utcnow() - timedelta(hours=1)
                self.metrics_history = [
                    m for m in self.metrics_history 
                    if m.timestamp > cutoff_time
                ]
                
            except Exception as e:
                logger.error(f"Metrics collection error: {e}")
            
            await asyncio.sleep(30)  # Collect every 30 seconds
    
    async def _process_alerts_loop(self):
        """Process and send alerts"""
        while self.monitoring:
            try:
                if self.alerts:
                    # Process pending alerts
                    alerts_to_send = self.alerts[:10]  # Process up to 10 alerts
                    self.alerts = self.alerts[10:]
                    
                    for alert in alerts_to_send:
                        await self._send_alert(alert)
                
            except Exception as e:
                logger.error(f"Alert processing error: {e}")
            
            await asyncio.sleep(10)  # Check every 10 seconds
    
    async def _send_alert(self, alert: Dict):
        """Send alert via configured channels"""
        logger.warning(f"Alert: {alert}")
        
        # Send to webhook if configured
        webhook_url = self.config['alerts'].get('webhook')
        if webhook_url:
            try:
                async with aiohttp.ClientSession() as session:
                    await session.post(webhook_url, json=alert)
            except Exception as e:
                logger.error(f"Failed to send webhook alert: {e}")
    
    async def get_health_status(self) -> Dict:
        """Get overall health status"""
        statuses = {}
        overall_status = HealthStatus.HEALTHY
        
        for name, check in self.health_checks.items():
            statuses[name] = {
                'status': check.last_status.value,
                'last_check': check.last_check.isoformat() if check.last_check else None,
                'consecutive_failures': check.consecutive_failures,
                'error': check.error_message
            }
            
            # Update overall status
            if check.last_status == HealthStatus.CRITICAL:
                overall_status = HealthStatus.CRITICAL
            elif check.last_status == HealthStatus.UNHEALTHY and overall_status != HealthStatus.CRITICAL:
                overall_status = HealthStatus.UNHEALTHY
            elif check.last_status == HealthStatus.DEGRADED and overall_status == HealthStatus.HEALTHY:
                overall_status = HealthStatus.DEGRADED
        
        # Get latest metrics
        latest_metrics = self.metrics_history[-1].to_dict() if self.metrics_history else None
        
        return {
            'overall_status': overall_status.value,
            'checks': statuses,
            'metrics': latest_metrics,
            'alerts_pending': len(self.alerts),
            'recovery_in_progress': list(self.recovery_in_progress.keys())
        }
    
    async def save_health_report(self, filename: str = 'health_report.json'):
        """Save health report"""
        report = await self.get_health_status()
        report['timestamp'] = datetime.utcnow().isoformat()
        report['metrics_history'] = [m.to_dict() for m in self.metrics_history[-20:]]  # Last 20 metrics
        
        async with aiofiles.open(filename, 'w') as f:
            await f.write(json.dumps(report, indent=2))
        
        logger.info(f"Saved health report to {filename}")


async def main():
    """Main monitoring function"""
    monitor = HealthMonitor()
    
    # Start monitoring
    try:
        await monitor.start_monitoring()
    except KeyboardInterrupt:
        logger.info("Monitoring stopped by user")
        
        # Save final report
        await monitor.save_health_report()


if __name__ == '__main__':
    asyncio.run(main())