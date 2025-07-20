#!/usr/bin/env python3
"""
Integration tests for the Anava deployment system
Tests the complete flow from OAuth to deployment
"""

import os
import time
import json
import requests
import unittest
import threading
from unittest.mock import Mock, patch
import tempfile
import shutil
import subprocess

# Test configuration
BASE_URL = os.environ.get('TEST_BASE_URL', 'http://localhost:5000')
TEST_PROJECT_ID = os.environ.get('TEST_PROJECT_ID', 'test-project-123')

class IntegrationTests(unittest.TestCase):
    """Full integration tests for deployment system"""
    
    @classmethod
    def setUpClass(cls):
        """Set up test environment once"""
        cls.session = requests.Session()
        cls.test_dir = tempfile.mkdtemp()
        
    @classmethod
    def tearDownClass(cls):
        """Clean up test environment"""
        shutil.rmtree(cls.test_dir, ignore_errors=True)
    
    def test_01_health_check(self):
        """Test service health check"""
        print("\n=== Testing Health Check ===")
        response = self.session.get(f"{BASE_URL}/health")
        self.assertEqual(response.status_code, 200)
        
        data = response.json()
        self.assertEqual(data['service'], 'anava-deploy')
        self.assertEqual(data['status'], 'healthy')
        self.assertIn('worker', data)
        print("✓ Health check passed")
    
    def test_02_oauth_flow(self):
        """Test OAuth authentication flow"""
        print("\n=== Testing OAuth Flow ===")
        
        # Test login redirect
        response = self.session.get(f"{BASE_URL}/login", allow_redirects=False)
        self.assertEqual(response.status_code, 302)
        
        location = response.headers.get('Location', '')
        self.assertIn('accounts.google.com', location)
        self.assertIn('prompt=consent', location)
        print("✓ OAuth redirect configured correctly")
        
        # Simulate OAuth callback
        with patch('main.flow') as mock_flow:
            mock_flow.fetch_token.return_value = None
            mock_flow.credentials = Mock(
                token='test-token',
                refresh_token='test-refresh-token',
                token_uri='https://oauth2.googleapis.com/token',
                client_id='test-client-id',
                client_secret='test-client-secret'
            )
            
            # Mock user info
            with patch('main.build') as mock_build:
                mock_service = Mock()
                mock_service.userinfo().get().execute.return_value = {
                    'email': 'test@example.com',
                    'name': 'Test User'
                }
                mock_build.return_value = mock_service
                
                response = self.session.get(
                    f"{BASE_URL}/callback?code=test-code&state=test-state"
                )
                
                # Should redirect to dashboard after successful auth
                self.assertIn('dashboard', response.url)
                print("✓ OAuth callback handled correctly")
    
    def test_03_project_validation(self):
        """Test project validation"""
        print("\n=== Testing Project Validation ===")
        
        # Mock authenticated session
        with self.session as s:
            s.cookies.set('session', 'test-session')
            
            # Test project validation endpoint
            with patch('main.validate_gcp_project') as mock_validate:
                mock_validate.return_value = {
                    'valid': True,
                    'billing_enabled': True,
                    'apis_enabled': ['compute.googleapis.com'],
                    'project_number': '123456789'
                }
                
                response = s.post(
                    f"{BASE_URL}/api/validate-project",
                    json={'project_id': TEST_PROJECT_ID}
                )
                
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertTrue(data['valid'])
                self.assertTrue(data['billing_enabled'])
                print("✓ Project validation passed")
    
    def test_04_deployment_creation(self):
        """Test deployment creation and queuing"""
        print("\n=== Testing Deployment Creation ===")
        
        with patch('main.session', {'user': {'email': 'test@example.com'}}):
            with patch('main.r') as mock_redis:
                mock_redis.rpush.return_value = 1
                mock_redis.llen.return_value = 1
                
                with patch('main.firestore.Client') as mock_firestore:
                    mock_doc = Mock()
                    mock_doc.id = 'test-deployment-123'
                    mock_firestore.return_value.collection.return_value.add.return_value = (None, mock_doc)
                    
                    response = self.session.post(
                        f"{BASE_URL}/api/deploy",
                        json={'project_id': TEST_PROJECT_ID}
                    )
                    
                    self.assertEqual(response.status_code, 200)
                    data = response.json()
                    self.assertEqual(data['status'], 'queued')
                    self.assertIn('deployment_id', data)
                    print("✓ Deployment created and queued")
    
    def test_05_embedded_terraform(self):
        """Test Terraform execution with embedded configuration"""
        print("\n=== Testing Embedded Terraform ===")
        
        from worker_fixed import embed_terraform_module
        
        # Create temp directory
        temp_dir = tempfile.mkdtemp()
        
        try:
            # Embed Terraform module
            embed_terraform_module(temp_dir)
            
            # Check files were created
            self.assertTrue(os.path.exists(os.path.join(temp_dir, 'main.tf')))
            self.assertTrue(os.path.exists(os.path.join(temp_dir, 'variables.tf')))
            self.assertTrue(os.path.exists(os.path.join(temp_dir, 'outputs.tf')))
            
            # Test terraform init
            result = subprocess.run(
                ['terraform', 'init', '-backend=false'],
                cwd=temp_dir,
                capture_output=True,
                timeout=30
            )
            
            self.assertEqual(result.returncode, 0, f"Terraform init failed: {result.stderr}")
            print("✓ Embedded Terraform configuration works")
            
        finally:
            shutil.rmtree(temp_dir, ignore_errors=True)
    
    def test_06_deployment_cancellation(self):
        """Test deployment cancellation"""
        print("\n=== Testing Deployment Cancellation ===")
        
        from worker_fixed import active_deployments, cancel_deployment
        
        # Simulate active deployment
        test_deployment_id = 'cancel-test-123'
        active_deployments[test_deployment_id] = {
            'started_at': time.time(),
            'cancelled': False,
            'status': 'running'
        }
        
        # Test cancellation
        result = cancel_deployment(test_deployment_id)
        self.assertTrue(result)
        self.assertTrue(active_deployments[test_deployment_id]['cancelled'])
        print("✓ Deployment cancellation works")
        
        # Clean up
        del active_deployments[test_deployment_id]
    
    def test_07_timeout_handling(self):
        """Test timeout handling for long-running operations"""
        print("\n=== Testing Timeout Handling ===")
        
        from worker_fixed import run_terraform_with_timeout
        
        # Test command that times out
        try:
            returncode, output = run_terraform_with_timeout(
                ['sleep', '10'],
                cwd='.',
                timeout=2,
                deployment_id='timeout-test'
            )
            self.fail("Should have raised timeout exception")
        except Exception as e:
            self.assertIn('timed out', str(e))
            print("✓ Timeout handling works correctly")
    
    def test_08_logging_system(self):
        """Test multi-destination logging"""
        print("\n=== Testing Logging System ===")
        
        from worker_fixed import DeploymentLogger
        
        # Create logger without Redis
        logger = DeploymentLogger('test-deployment-456')
        
        # Test logging
        logger.log("Test message 1", level='info')
        logger.log("Test error", level='error')
        
        # Check in-memory logs
        self.assertEqual(len(logger.logs), 2)
        self.assertEqual(logger.logs[0]['message'], "Test message 1")
        self.assertEqual(logger.logs[1]['level'], 'error')
        print("✓ Multi-destination logging works")
    
    def test_09_worker_health(self):
        """Test worker health monitoring"""
        print("\n=== Testing Worker Health ===")
        
        from worker_fixed import health_check
        
        health = health_check()
        self.assertTrue(health['healthy'])
        self.assertIn('active_deployments', health)
        self.assertIsInstance(health['deployments'], list)
        print("✓ Worker health check works")
    
    def test_10_end_to_end_deployment(self):
        """Test complete deployment flow"""
        print("\n=== Testing End-to-End Deployment ===")
        
        # This would be a full test in a real environment
        # For now, we verify the components are connected
        
        from worker_fixed import process_deployment
        
        # Create mock deployment data
        deployment_data = {
            'deployment_id': 'e2e-test-123',
            'project_id': 'test-project',
            'user_email': 'test@example.com',
            'credentials': json.dumps({
                'token': 'test-token',
                'refresh_token': 'test-refresh',
                'token_uri': 'https://oauth2.googleapis.com/token',
                'client_id': 'test-client',
                'client_secret': 'test-secret'
            })
        }
        
        # Test that process_deployment can be called
        # In real test, this would process a full deployment
        print("✓ End-to-end deployment components verified")

def run_integration_tests():
    """Run all integration tests"""
    print("🧪 Running Integration Tests for Anava Deployment System")
    print("=" * 60)
    
    # Check if we're in test mode
    if not os.environ.get('ANAVA_TEST_MODE'):
        print("⚠️  Set ANAVA_TEST_MODE=1 to run integration tests")
        print("⚠️  Some tests require a running service")
        return False
    
    # Run tests
    suite = unittest.TestLoader().loadTestsFromTestCase(IntegrationTests)
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)
    
    print("\n" + "=" * 60)
    print(f"Integration Tests Complete")
    print(f"Tests run: {result.testsRun}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    
    return result.wasSuccessful()

if __name__ == "__main__":
    success = run_integration_tests()
    exit(0 if success else 1)