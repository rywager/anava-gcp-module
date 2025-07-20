# Anava Deployment Service Fix Strategy

## Executive Summary
The deployment service has three critical issues:
1. **Resource cleanup fails** due to permission errors (but we don't need to delete everything)
2. **Redis is unreachable** from Cloud Run, preventing log display
3. **Missing outputs** because Terraform doesn't recreate existing resources

## Strategic Approach

### 1. Smart Resource Handling (Priority: HIGH)
**Problem**: Current code tries to delete ALL resources, but service accounts don't produce outputs we need.

**Solution**: Implement selective resource handling
- **SKIP DELETION**: Service accounts, IAM bindings, API enablement
- **HANDLE EXISTING**: API Gateway, API Keys, Firebase app, Secrets
- **ALWAYS RECREATE**: Resources that produce critical outputs

### 2. Fix Log Display Without Redis (Priority: HIGH)
**Problem**: Redis private IP (10.77.208.3) is unreachable from Cloud Run

**Solution**: Implement Firestore-based logging fallback
- Use Firestore subcollections for logs
- Real-time updates via Firestore listeners
- No additional infrastructure needed

### 3. Handle Existing Resources (Priority: CRITICAL)
**Problem**: Terraform doesn't output values for existing resources

**Solution**: Query resources directly after deployment
- Use gcloud/API calls to get existing resource values
- Store outputs in deployment record
- Handle both new and existing deployments

## Implementation Steps

### Step 1: Replace Cleanup Logic
```python
# Instead of deleting all resources, only clean those that block recreation
RESOURCES_TO_CLEAN = {
    'api_gateway': True,      # Must delete to get new URL
    'api_keys': True,         # Must delete to get new key
    'secrets': False,         # Can update existing
    'service_accounts': False, # Keep existing
    'buckets': False,         # Keep existing
    'iam_bindings': False     # Keep existing
}
```

### Step 2: Implement Firestore Logging
```python
def log_to_firestore(deployment_id, message, step_info=None):
    """Log to Firestore instead of Redis"""
    log_ref = db.collection('deployments').document(deployment_id)\
                .collection('logs').document()
    
    log_entry = {
        'timestamp': datetime.utcnow(),
        'message': message,
        'step_info': step_info
    }
    
    log_ref.set(log_entry)
```

### Step 3: Resource Discovery Function
```python
def discover_existing_outputs(project_id, prefix):
    """Get outputs from existing resources"""
    outputs = {}
    
    # 1. Get API Gateway URL
    gateways = list_api_gateways(project_id, prefix)
    if gateways:
        outputs['apiGatewayUrl'] = get_gateway_url(gateways[0])
    
    # 2. Get API Key from Secret Manager
    try:
        api_key = get_secret_value(f"{prefix}-api-key", project_id)
        outputs['apiKey'] = api_key
    except:
        # Create new API key if missing
        outputs['apiKey'] = create_api_key(project_id, prefix)
    
    # 3. Get Firebase config
    firebase_config = get_firebase_config(project_id)
    outputs['firebaseConfig'] = firebase_config
    
    return outputs
```

### Step 4: Terraform Import Strategy
```python
# Import existing resources instead of failing
IMPORT_COMMANDS = [
    f"terraform import module.anava.google_service_account.device_auth {prefix}-device-auth-sa",
    f"terraform import module.anava.google_storage_bucket.firebase {project_id}-{prefix}-firebase",
    # ... other resources
]
```

## Specific Fixes

### Fix 1: Selective Resource Cleanup
```python
def cleanup_blocking_resources(project_id, prefix, log):
    """Only clean resources that block output generation"""
    
    # Delete API Gateway (to get new URL)
    delete_api_gateway(project_id, prefix, log)
    
    # Delete API Keys (to get new key)
    delete_api_keys(project_id, prefix, log)
    
    # Keep service accounts - just ensure permissions
    ensure_service_account_permissions(project_id, prefix, log)
```

### Fix 2: Firestore-based Logging
```python
# Replace Redis logging with Firestore
class FirestoreLogger:
    def __init__(self, deployment_id):
        self.deployment_id = deployment_id
        self.logs_collection = db.collection('deployments')\
            .document(deployment_id).collection('logs')
    
    def log(self, message, step_info=None):
        self.logs_collection.add({
            'timestamp': datetime.utcnow(),
            'message': message,
            'step_info': step_info or {}
        })
```

### Fix 3: Output Discovery
```python
def get_deployment_outputs(project_id, prefix, credentials):
    """Get outputs from existing or new resources"""
    
    outputs = {}
    
    # Try Terraform outputs first
    tf_outputs = get_terraform_outputs()
    
    # Fill in missing values by querying resources
    if not tf_outputs.get('apiGatewayUrl'):
        outputs['apiGatewayUrl'] = discover_api_gateway_url(project_id, prefix)
    
    if not tf_outputs.get('apiKey'):
        outputs['apiKey'] = get_or_create_api_key(project_id, prefix)
    
    if not tf_outputs.get('firebaseConfig'):
        outputs['firebaseConfig'] = get_firebase_config_directly(project_id)
    
    return outputs
```

## Testing Strategy

### 1. Test Existing Resource Handling
- Deploy to project with existing resources
- Verify outputs are retrieved correctly
- Ensure no permission errors

### 2. Test Firestore Logging
- Deploy with Firestore logging
- Verify real-time log updates
- Test log retention and cleanup

### 3. Test Partial Deployments
- Simulate failures at different stages
- Verify recovery and retry logic
- Ensure outputs are captured

## Quick Wins

1. **Remove service account deletion** - Immediate fix for permission errors
2. **Add Firestore logging** - Fix UI log display without Redis
3. **Query existing resources** - Get outputs without recreation

## Long-term Improvements

1. **Use Terraform data sources** for existing resources
2. **Implement proper service mesh** for Redis connectivity
3. **Add deployment state machine** for better tracking

## Risk Mitigation

1. **Backwards compatibility**: Support both new and existing deployments
2. **Graceful degradation**: Fall back to direct API calls if Terraform fails
3. **Audit trail**: Log all operations to Firestore for debugging