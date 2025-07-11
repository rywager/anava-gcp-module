# Anava Deployment Service Testing Strategy

## Testing Phases

### Phase 1: Unit Testing (Local)

#### 1. Test Firestore Logger
```python
def test_firestore_logger():
    """Test Firestore logging functionality"""
    # Mock Firestore client
    mock_db = MockFirestore()
    logger = FirestoreLogger(mock_db, "test-deployment-id")
    
    # Test basic logging
    logger.log("Test message")
    assert mock_db.logs_count() == 1
    
    # Test status updates
    logger.log("STATUS: ENABLING_APIS")
    assert mock_db.get_current_step() == "enabling-apis"
    
    # Test step transitions
    logger.log("STATUS: SETTING_PERMISSIONS")
    assert mock_db.get_step_status("enabling-apis") == "completed"
    assert mock_db.get_step_status("permissions") == "active"
```

#### 2. Test Resource Discovery
```python
def test_resource_discovery():
    """Test discovery of existing resources"""
    # Test with mock gcloud responses
    with patch('subprocess.run') as mock_run:
        mock_run.return_value.stdout = json.dumps({
            "defaultHostname": "gateway-abc123.uc.gateway.dev"
        })
        
        outputs = discover_existing_outputs("test-project", "test-prefix", mock_creds, mock_logger)
        
        assert outputs['apiGatewayUrl'] == "https://gateway-abc123.uc.gateway.dev"
```

#### 3. Test Selective Cleanup
```python
def test_selective_cleanup():
    """Test that only blocking resources are cleaned"""
    cleaned_resources = []
    
    def mock_run(cmd, **kwargs):
        if 'delete' in cmd and 'service-accounts' in cmd:
            raise Exception("Should not delete service accounts!")
        cleaned_resources.append(cmd)
        return MockResult(returncode=0)
    
    with patch('subprocess.run', mock_run):
        cleanup_blocking_resources("test-project", "test-prefix", mock_logger)
    
    # Verify only API Gateway and functions were cleaned
    assert any('api-gateway' in str(cmd) for cmd in cleaned_resources)
    assert not any('service-accounts' in str(cmd) for cmd in cleaned_resources)
```

### Phase 2: Integration Testing (Test Project)

#### Test Environment Setup
```bash
# Create test project
export TEST_PROJECT_ID="anava-test-deployment-v24"
export TEST_PREFIX="test24"
export TEST_REGION="us-central1"

# Enable minimal APIs for testing
gcloud services enable cloudresourcemanager.googleapis.com \
  iam.googleapis.com \
  --project=$TEST_PROJECT_ID
```

#### Test Scenarios

##### Scenario 1: Fresh Deployment
```python
def test_fresh_deployment():
    """Test deployment to a clean project"""
    job_data = {
        'deploymentId': 'test-fresh-001',
        'projectId': TEST_PROJECT_ID,
        'region': TEST_REGION,
        'prefix': f'{TEST_PREFIX}-fresh',
        'credentials': get_test_credentials()
    }
    
    run_single_deployment_fixed(job_data, test_db)
    
    # Verify outputs
    deployment = get_deployment(job_data['deploymentId'])
    assert deployment['status'] == 'completed'
    assert deployment['outputs']['apiGatewayUrl'] != 'Not found'
    assert deployment['outputs']['apiKey'] != 'Not found'
```

##### Scenario 2: Existing Resources
```python
def test_existing_resources():
    """Test deployment with existing resources"""
    # Pre-create some resources
    create_test_service_accounts(TEST_PROJECT_ID, f'{TEST_PREFIX}-exist')
    
    job_data = {
        'deploymentId': 'test-exist-001',
        'projectId': TEST_PROJECT_ID,
        'region': TEST_REGION,
        'prefix': f'{TEST_PREFIX}-exist',
        'credentials': get_test_credentials()
    }
    
    run_single_deployment_fixed(job_data, test_db)
    
    # Verify service accounts were not deleted
    assert service_account_exists(f'{TEST_PREFIX}-exist-device-auth-sa')
    
    # Verify outputs were still retrieved
    deployment = get_deployment(job_data['deploymentId'])
    assert deployment['outputs']['apiGatewayUrl'] != 'Not found'
```

##### Scenario 3: Partial Failure Recovery
```python
def test_partial_failure_recovery():
    """Test recovery from partial deployment"""
    # Simulate a deployment that fails halfway
    with patch('subprocess.run') as mock_run:
        # Make Cloud Functions deployment fail
        def side_effect(cmd, **kwargs):
            if 'functions' in str(cmd) and 'deploy' in str(cmd):
                return MockResult(returncode=1, stderr="Deployment failed")
            return MockResult(returncode=0)
        
        mock_run.side_effect = side_effect
        
        job_data = {
            'deploymentId': 'test-partial-001',
            'projectId': TEST_PROJECT_ID,
            'region': TEST_REGION,
            'prefix': f'{TEST_PREFIX}-partial',
            'credentials': get_test_credentials()
        }
        
        run_single_deployment_fixed(job_data, test_db)
    
    # Verify partial outputs were captured
    deployment = get_deployment(job_data['deploymentId'])
    assert deployment['status'] == 'failed'
    assert 'partialOutputs' in deployment
```

##### Scenario 4: Permission Errors
```python
def test_insufficient_permissions():
    """Test handling of permission errors"""
    # Use credentials with limited permissions
    limited_creds = get_limited_test_credentials()
    
    job_data = {
        'deploymentId': 'test-perms-001',
        'projectId': TEST_PROJECT_ID,
        'region': TEST_REGION,
        'prefix': f'{TEST_PREFIX}-perms',
        'credentials': limited_creds
    }
    
    run_single_deployment_fixed(job_data, test_db)
    
    # Verify graceful handling
    deployment = get_deployment(job_data['deploymentId'])
    assert 'permission' in deployment.get('error', '').lower()
```

### Phase 3: Load Testing

#### Concurrent Deployments
```python
def test_concurrent_deployments():
    """Test multiple simultaneous deployments"""
    import concurrent.futures
    
    def run_deployment(index):
        job_data = {
            'deploymentId': f'test-concurrent-{index:03d}',
            'projectId': TEST_PROJECT_ID,
            'region': TEST_REGION,
            'prefix': f'{TEST_PREFIX}-c{index}',
            'credentials': get_test_credentials()
        }
        return run_single_deployment_fixed(job_data, test_db)
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=5) as executor:
        futures = [executor.submit(run_deployment, i) for i in range(5)]
        results = [f.result() for f in futures]
    
    # Verify all deployments completed
    for i in range(5):
        deployment = get_deployment(f'test-concurrent-{i:03d}')
        assert deployment['status'] in ['completed', 'failed']
```

### Phase 4: UI Testing

#### Dashboard Real-time Updates
```javascript
async function test_dashboard_updates() {
    // Create test deployment
    const testDeployment = await createTestDeployment();
    
    // Verify initial state
    await waitForElement(`deployment-${testDeployment.id}`);
    assert(getStepStatus('enabling-apis') === 'pending');
    
    // Simulate progress
    await updateDeploymentStep(testDeployment.id, 'enabling-apis', 'active');
    await wait(100);
    assert(getStepStatus('enabling-apis') === 'active');
    
    // Verify log streaming
    await addTestLog(testDeployment.id, 'Test log message');
    await wait(100);
    assert(getLogCount() > 0);
}
```

### Phase 5: Production Testing

#### Canary Deployment
1. Deploy to 10% of traffic
2. Monitor error rates and performance
3. Check output accuracy
4. Gradually increase traffic

#### Monitoring Metrics
- Deployment success rate
- Average deployment time
- Resource creation failures
- API call latencies
- Firestore read/write rates

#### Rollback Plan
```bash
# Quick rollback script
#!/bin/bash
PREVIOUS_VERSION="v2.3.23"
CURRENT_VERSION="v2.3.24-fixed"

# Revert Cloud Run service
gcloud run services update anava-deployment-service \
  --image="gcr.io/${PROJECT_ID}/anava-deployment:${PREVIOUS_VERSION}" \
  --region=${REGION}

# Monitor rollback
gcloud run services describe anava-deployment-service \
  --region=${REGION} \
  --format="value(status.url)"
```

## Test Data Management

### Test Credentials
```python
def get_test_credentials():
    """Get OAuth credentials for testing"""
    return {
        'token': os.environ['TEST_OAUTH_TOKEN'],
        'refresh_token': os.environ['TEST_REFRESH_TOKEN'],
        'token_uri': 'https://oauth2.googleapis.com/token',
        'client_id': os.environ['TEST_CLIENT_ID'],
        'client_secret': os.environ['TEST_CLIENT_SECRET']
    }
```

### Cleanup After Tests
```bash
#!/bin/bash
# Clean up test resources
PREFIX="test24"
PROJECT_ID="anava-test-deployment-v24"

# Delete test deployments
for deployment in $(gcloud firestore documents list \
  deployments --project=$PROJECT_ID --format="value(name)"); do
  if [[ $deployment == *"$PREFIX"* ]]; then
    gcloud firestore documents delete $deployment --project=$PROJECT_ID
  fi
done

# Delete test resources
gcloud api-gateway gateways list --project=$PROJECT_ID --format="value(name)" | \
  grep $PREFIX | xargs -I {} gcloud api-gateway gateways delete {} --quiet

# Delete test service accounts (optional - usually keep these)
# gcloud iam service-accounts list --project=$PROJECT_ID --format="value(email)" | \
#   grep $PREFIX | xargs -I {} gcloud iam service-accounts delete {} --quiet
```

## Success Criteria

### Functional Requirements
- [ ] Deployments complete without permission errors
- [ ] API Gateway URL is retrieved correctly
- [ ] API Key is accessible
- [ ] Firebase config is available
- [ ] Logs appear in dashboard in real-time
- [ ] Existing resources are handled gracefully

### Performance Requirements
- [ ] Deployment completes in < 10 minutes
- [ ] Dashboard updates within 2 seconds
- [ ] No Redis dependency failures
- [ ] Concurrent deployments don't interfere

### Reliability Requirements
- [ ] 95% deployment success rate
- [ ] Graceful handling of API failures
- [ ] Partial output recovery on failure
- [ ] No data loss during deployment

## Test Execution Plan

1. **Week 1**: Unit tests and local integration
2. **Week 2**: Test environment validation
3. **Week 3**: Load testing and UI testing
4. **Week 4**: Canary deployment to production
5. **Week 5**: Full rollout and monitoring