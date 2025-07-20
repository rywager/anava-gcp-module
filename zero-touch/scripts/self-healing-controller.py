#!/usr/bin/env python3
"""
Anava Vision Self-Healing Controller
Monitors system health and automatically fixes common issues
"""

import os
import time
import logging
import json
from datetime import datetime, timedelta
from typing import Dict, List, Any
from kubernetes import client, config, watch
from prometheus_client.parser import text_string_to_metric_families
import requests

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('self-healing-controller')

class SelfHealingController:
    def __init__(self):
        # Load Kubernetes config
        try:
            config.load_incluster_config()
        except:
            config.load_kube_config()
        
        self.v1 = client.CoreV1Api()
        self.apps_v1 = client.AppsV1Api()
        self.autoscaling_v1 = client.AutoscalingV1Api()
        
        self.namespace = os.environ.get('NAMESPACE', 'anava-vision')
        self.check_interval = int(os.environ.get('CHECK_INTERVAL', '60'))
        self.prometheus_url = os.environ.get('PROMETHEUS_URL', 'http://prometheus:9090')
        
        # Healing rules
        self.healing_rules = self.load_healing_rules()
        self.healing_history = {}
        
    def load_healing_rules(self) -> List[Dict[str, Any]]:
        """Load healing rules from ConfigMap"""
        try:
            cm = self.v1.read_namespaced_config_map(
                name='self-healing-config',
                namespace=self.namespace
            )
            rules_yaml = cm.data.get('heal.yaml', '{}')
            import yaml
            config = yaml.safe_load(rules_yaml)
            return config.get('rules', [])
        except Exception as e:
            logger.error(f"Failed to load healing rules: {e}")
            return self.get_default_rules()
    
    def get_default_rules(self) -> List[Dict[str, Any]]:
        """Default healing rules"""
        return [
            {
                'name': 'restart-on-memory-pressure',
                'condition': 'memory_usage_percent > 90',
                'action': 'restart_pod',
                'cooldown': 300
            },
            {
                'name': 'scale-on-high-cpu',
                'condition': 'cpu_usage_percent > 80',
                'action': 'scale_up',
                'max_replicas': 10
            },
            {
                'name': 'fix-websocket-connections',
                'condition': 'websocket_errors > 100',
                'action': 'restart_websocket_service'
            },
            {
                'name': 'database-connection-recovery',
                'condition': 'database_connection_failed',
                'action': 'reconnect_database',
                'max_retries': 5
            },
            {
                'name': 'camera-reconnection',
                'condition': 'camera_disconnected',
                'action': 'reconnect_camera',
                'retry_interval': 60
            }
        ]
    
    def run(self):
        """Main control loop"""
        logger.info(f"Self-healing controller started for namespace: {self.namespace}")
        
        while True:
            try:
                # Check system health
                metrics = self.collect_metrics()
                
                # Evaluate healing rules
                for rule in self.healing_rules:
                    if self.should_heal(rule, metrics):
                        self.execute_healing(rule, metrics)
                
                # Clean up old healing history
                self.cleanup_history()
                
            except Exception as e:
                logger.error(f"Error in control loop: {e}")
            
            time.sleep(self.check_interval)
    
    def collect_metrics(self) -> Dict[str, Any]:
        """Collect system metrics"""
        metrics = {}
        
        # Get pod metrics
        pods = self.v1.list_namespaced_pod(namespace=self.namespace)
        metrics['pods'] = []
        
        for pod in pods.items:
            pod_metrics = {
                'name': pod.metadata.name,
                'status': pod.status.phase,
                'restarts': sum(cs.restart_count for cs in pod.status.container_statuses or []),
                'conditions': {c.type: c.status for c in pod.status.conditions or []}
            }
            metrics['pods'].append(pod_metrics)
        
        # Get deployment metrics
        deployments = self.apps_v1.list_namespaced_deployment(namespace=self.namespace)
        metrics['deployments'] = []
        
        for deployment in deployments.items:
            dep_metrics = {
                'name': deployment.metadata.name,
                'replicas': deployment.status.replicas or 0,
                'ready_replicas': deployment.status.ready_replicas or 0,
                'available_replicas': deployment.status.available_replicas or 0
            }
            metrics['deployments'].append(dep_metrics)
        
        # Get Prometheus metrics
        try:
            prom_metrics = self.get_prometheus_metrics()
            metrics.update(prom_metrics)
        except Exception as e:
            logger.error(f"Failed to get Prometheus metrics: {e}")
        
        return metrics
    
    def get_prometheus_metrics(self) -> Dict[str, Any]:
        """Query Prometheus for metrics"""
        metrics = {}
        
        queries = {
            'memory_usage_percent': f'(container_memory_usage_bytes{{namespace="{self.namespace}"}} / container_spec_memory_limit_bytes) * 100',
            'cpu_usage_percent': f'rate(container_cpu_usage_seconds_total{{namespace="{self.namespace}"}}[5m]) * 100',
            'websocket_errors': f'rate(anava_vision_websocket_errors_total[5m])',
            'database_connection_failed': f'up{{job="postgresql"}} == 0',
            'camera_disconnected': f'anava_vision_camera_status{{status="disconnected"}} > 0'
        }
        
        for name, query in queries.items():
            try:
                response = requests.get(
                    f"{self.prometheus_url}/api/v1/query",
                    params={'query': query}
                )
                if response.ok:
                    data = response.json()
                    if data['data']['result']:
                        value = float(data['data']['result'][0]['value'][1])
                        metrics[name] = value
            except Exception as e:
                logger.error(f"Failed to query {name}: {e}")
        
        return metrics
    
    def should_heal(self, rule: Dict[str, Any], metrics: Dict[str, Any]) -> bool:
        """Evaluate if healing should be performed"""
        rule_name = rule['name']
        
        # Check cooldown
        if rule_name in self.healing_history:
            last_execution = self.healing_history[rule_name]
            cooldown = rule.get('cooldown', 300)
            if datetime.now() - last_execution < timedelta(seconds=cooldown):
                return False
        
        # Evaluate condition
        condition = rule['condition']
        try:
            # Simple condition evaluation (in production, use a proper expression evaluator)
            for metric_name, metric_value in metrics.items():
                condition = condition.replace(metric_name, str(metric_value))
            
            # WARNING: This is simplified. In production, use ast.literal_eval or similar
            result = eval(condition)
            return bool(result)
        except Exception as e:
            logger.error(f"Failed to evaluate condition for {rule_name}: {e}")
            return False
    
    def execute_healing(self, rule: Dict[str, Any], metrics: Dict[str, Any]):
        """Execute healing action"""
        action = rule['action']
        rule_name = rule['name']
        
        logger.info(f"Executing healing action: {rule_name} - {action}")
        
        try:
            if action == 'restart_pod':
                self.restart_pods(rule, metrics)
            elif action == 'scale_up':
                self.scale_deployment(rule, metrics)
            elif action == 'restart_websocket_service':
                self.restart_websocket_service()
            elif action == 'reconnect_database':
                self.reconnect_database()
            elif action == 'reconnect_camera':
                self.reconnect_cameras(metrics)
            
            # Record healing action
            self.healing_history[rule_name] = datetime.now()
            logger.info(f"Successfully executed healing action: {rule_name}")
            
        except Exception as e:
            logger.error(f"Failed to execute healing action {rule_name}: {e}")
    
    def restart_pods(self, rule: Dict[str, Any], metrics: Dict[str, Any]):
        """Restart pods with high memory usage"""
        for pod in metrics.get('pods', []):
            if pod['status'] == 'Running':
                # Delete pod to trigger restart
                self.v1.delete_namespaced_pod(
                    name=pod['name'],
                    namespace=self.namespace,
                    grace_period_seconds=30
                )
                logger.info(f"Restarted pod: {pod['name']}")
                # Only restart one pod at a time
                break
    
    def scale_deployment(self, rule: Dict[str, Any], metrics: Dict[str, Any]):
        """Scale up deployment"""
        max_replicas = rule.get('max_replicas', 10)
        
        for deployment in metrics.get('deployments', []):
            current_replicas = deployment['replicas']
            if current_replicas < max_replicas:
                new_replicas = min(current_replicas + 1, max_replicas)
                
                # Update deployment
                body = {'spec': {'replicas': new_replicas}}
                self.apps_v1.patch_namespaced_deployment(
                    name=deployment['name'],
                    namespace=self.namespace,
                    body=body
                )
                logger.info(f"Scaled {deployment['name']} from {current_replicas} to {new_replicas} replicas")
                break
    
    def restart_websocket_service(self):
        """Restart WebSocket service pods"""
        label_selector = 'app=anava-vision,component=websocket'
        pods = self.v1.list_namespaced_pod(
            namespace=self.namespace,
            label_selector=label_selector
        )
        
        for pod in pods.items:
            self.v1.delete_namespaced_pod(
                name=pod.metadata.name,
                namespace=self.namespace,
                grace_period_seconds=30
            )
            logger.info(f"Restarted WebSocket pod: {pod.metadata.name}")
    
    def reconnect_database(self):
        """Trigger database reconnection"""
        # Send signal to application pods to reconnect
        pods = self.v1.list_namespaced_pod(
            namespace=self.namespace,
            label_selector='app=anava-vision,component=api'
        )
        
        for pod in pods.items:
            # Execute reconnect command in pod
            try:
                response = self.v1.connect_post_namespaced_pod_exec(
                    name=pod.metadata.name,
                    namespace=self.namespace,
                    command=['/bin/sh', '-c', 'kill -USR1 1'],  # Send SIGUSR1 to trigger reconnect
                    stderr=True,
                    stdin=False,
                    stdout=True,
                    tty=False
                )
                logger.info(f"Triggered database reconnection in pod: {pod.metadata.name}")
            except Exception as e:
                logger.error(f"Failed to trigger reconnection in {pod.metadata.name}: {e}")
    
    def reconnect_cameras(self, metrics: Dict[str, Any]):
        """Reconnect disconnected cameras"""
        # Call camera service API to reconnect
        camera_service_url = f"http://anava-vision.{self.namespace}.svc.cluster.local/api/v1/cameras/reconnect"
        
        try:
            response = requests.post(camera_service_url, timeout=30)
            if response.ok:
                logger.info("Triggered camera reconnection")
            else:
                logger.error(f"Failed to trigger camera reconnection: {response.status_code}")
        except Exception as e:
            logger.error(f"Failed to call camera reconnection API: {e}")
    
    def cleanup_history(self):
        """Clean up old healing history"""
        cutoff_time = datetime.now() - timedelta(hours=24)
        self.healing_history = {
            k: v for k, v in self.healing_history.items()
            if v > cutoff_time
        }

if __name__ == '__main__':
    controller = SelfHealingController()
    controller.run()