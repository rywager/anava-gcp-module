# Implementation Guide for v2.3.24 Fixes

## Quick Start

### 1. Update main.py imports
```python
# Add at the top of main.py
from deployment_fixes import (
    FirestoreLogger,
    cleanup_blocking_resources,
    discover_existing_outputs,
    ensure_service_account_permissions,
    handle_terraform_imports,
    RESOURCES_TO_CLEAN
)
```

### 2. Replace run_single_deployment function
Replace the entire `run_single_deployment` function with the fixed version from `run_single_deployment_fixed.py`.

### 3. Update dashboard endpoint
```python
@app.route('/dashboard')
def dashboard():
    if 'user_info' not in session:
        return redirect(url_for('login'))
    
    # Get Firebase config for the dashboard
    firebase_config = {
        'apiKey': os.environ.get('FIREBASE_API_KEY', ''),
        'authDomain': f"{PROJECT_ID}.firebaseapp.com",
        'projectId': PROJECT_ID,
        'storageBucket': f"{PROJECT_ID}.appspot.com",
        'messagingSenderId': os.environ.get('FIREBASE_MESSAGING_SENDER_ID', ''),
        'appId': os.environ.get('FIREBASE_APP_ID', '')
    }
    
    # Use the fixed dashboard template
    with open('dashboard_fixed.html', 'r') as f:
        template_content = f.read()
    
    # Render with Firebase config
    from jinja2 import Template
    template = Template(template_content)
    return template.render(
        user_email=session['user_info']['email'],
        project_id=PROJECT_ID,
        region="us-central1",
        firebase_config=firebase_config
    )
```

### 4. Update get_deployment_status endpoint
```python
@app.route('/api/deployment/<deployment_id>')
def get_deployment_status(deployment_id):
    if 'user_info' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    deployment_ref = db.collection('deployments').document(deployment_id)
    deployment = deployment_ref.get()
    
    if not deployment.exists:
        return jsonify({'error': 'Deployment not found'}), 404
    
    deployment_data = deployment.to_dict()
    
    if deployment_data['user'] != session['user_info']['email']:
        return jsonify({'error': 'Unauthorized'}), 403
    
    # Get logs from Firestore subcollection
    logs_ref = deployment_ref.collection('logs')
    logs_query = logs_ref.order_by('timestamp', direction='ASCENDING').limit(1000)
    
    logs = []
    for log_doc in logs_query.stream():
        log_data = log_doc.to_dict()
        logs.append({
            'timestamp': log_data['timestamp'].isoformat() if hasattr(log_data['timestamp'], 'isoformat') else str(log_data['timestamp']),
            'message': log_data['message']
        })
    
    deployment_data['logs'] = logs
    
    # Include current step and step status from deployment doc
    deployment_data['currentStep'] = deployment_data.get('currentStep', '')
    deployment_data['steps'] = deployment_data.get('steps', {})
    
    return jsonify(deployment_data)
```

### 5. Remove Redis dependencies
```python
# Comment out or remove these lines:
# REDIS_HOST = os.environ.get('REDIS_HOST', 'localhost')
# REDIS_PORT = int(os.environ.get('REDIS_PORT', 6379))
# redis_client = get_redis_client()
# REDIS_AVAILABLE = redis_client is not None

# Set Redis as unavailable
REDIS_AVAILABLE = False
redis_client = None
```

### 6. Update process_worker function
```python
def process_worker():
    """Process deployment jobs from Firestore queue"""
    print(f"Worker started - Version {VERSION}")
    
    while True:
        try:
            # Query for pending deployments
            pending_query = db.collection('deployments')\
                .where('status', '==', 'pending')\
                .order_by('createdAt')\
                .limit(1)
            
            docs = list(pending_query.stream())
            
            if docs:
                doc = docs[0]
                deployment_data = doc.to_dict()
                deployment_data['deploymentId'] = doc.id
                
                print(f"Processing deployment {doc.id}")
                
                # Update status to prevent duplicate processing
                doc.reference.update({'status': 'processing'})
                
                # Run the fixed deployment function
                from run_single_deployment_fixed import run_single_deployment_fixed
                run_single_deployment_fixed(deployment_data, db)
                
            else:
                # No pending deployments, wait
                time.sleep(5)
                
        except Exception as e:
            print(f"Worker error: {e}")
            import traceback
            traceback.print_exc()
            time.sleep(10)
```

## Environment Variables

### Required
```bash
# Existing variables remain the same
PROJECT_ID=your-project-id
CLIENT_ID=your-oauth-client-id
CLIENT_SECRET=your-oauth-client-secret

# Remove Redis variables
# REDIS_HOST=xxx (remove)
# REDIS_PORT=xxx (remove)

# Add Firebase config for dashboard (optional)
FIREBASE_API_KEY=your-firebase-api-key
FIREBASE_APP_ID=your-firebase-app-id
FIREBASE_MESSAGING_SENDER_ID=your-sender-id
```

## Deployment Steps

### 1. Build new image
```bash
# Update version in main.py to 2.3.24
VERSION = "2.3.24"

# Build and push
docker build -t gcr.io/${PROJECT_ID}/anava-deployment:v2.3.24 .
docker push gcr.io/${PROJECT_ID}/anava-deployment:v2.3.24
```

### 2. Deploy to Cloud Run
```bash
gcloud run deploy anava-deployment-service \
  --image gcr.io/${PROJECT_ID}/anava-deployment:v2.3.24 \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars PROJECT_ID=${PROJECT_ID},CLIENT_ID=${CLIENT_ID},CLIENT_SECRET=${CLIENT_SECRET} \
  --memory 2Gi \
  --timeout 3600 \
  --max-instances 10
```

### 3. Verify deployment
```bash
# Check service status
gcloud run services describe anava-deployment-service --region us-central1

# Check logs
gcloud run logs read --service anava-deployment-service --region us-central1 --limit 50
```

## Rollback Procedure

If issues occur:
```bash
# Rollback to previous version
gcloud run services update anava-deployment-service \
  --image gcr.io/${PROJECT_ID}/anava-deployment:v2.3.23 \
  --region us-central1

# Monitor logs
gcloud run logs tail --service anava-deployment-service --region us-central1
```

## Monitoring

### Key Metrics to Watch
1. **Deployment Success Rate**
   ```sql
   SELECT 
     COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
     COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
     COUNT(*) as total
   FROM deployments
   WHERE createdAt > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
   ```

2. **Average Deployment Time**
   ```sql
   SELECT AVG(TIMESTAMP_DIFF(completedAt, startedAt, SECOND)) as avg_seconds
   FROM deployments
   WHERE status = 'completed'
   AND createdAt > TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 24 HOUR)
   ```

3. **Resource Creation Failures**
   - Monitor Cloud Run logs for "ERROR:" or "FAILED:" messages
   - Check for permission denied errors

### Alert Configuration
```yaml
# monitoring.yaml
alertPolicy:
  displayName: "Anava Deployment Failures"
  conditions:
    - displayName: "High failure rate"
      conditionThreshold:
        filter: |
          resource.type="cloud_run_revision"
          resource.labels.service_name="anava-deployment-service"
          textPayload=~"status.*failed"
        comparison: COMPARISON_GT
        thresholdValue: 5
        duration: 300s
```

## Troubleshooting

### Common Issues

1. **"Permission denied" errors**
   - Check service account permissions
   - Ensure Cloud Build service agents have correct roles
   - Run `ensure_service_account_permissions()` manually

2. **"Resource already exists" errors**
   - This is expected for some resources
   - The code will handle imports automatically
   - Outputs will be discovered from existing resources

3. **Missing outputs**
   - Check if resources were created successfully
   - Run `discover_existing_outputs()` manually to debug
   - Check Secret Manager for API keys

4. **Logs not appearing**
   - Verify Firestore security rules allow read/write
   - Check browser console for Firebase errors
   - Ensure deployment document exists in Firestore

### Debug Commands
```python
# Test resource discovery
from deployment_fixes import discover_existing_outputs
outputs = discover_existing_outputs("your-project", "your-prefix", credentials, logger)
print(outputs)

# Test Firestore logging
from deployment_fixes import FirestoreLogger
logger = FirestoreLogger(db, "test-deployment-id")
logger.log("Test message")

# Check service account permissions
from deployment_fixes import ensure_service_account_permissions
ensure_service_account_permissions("your-project", "your-prefix", logger)
```