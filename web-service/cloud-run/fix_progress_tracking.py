#!/usr/bin/env python3
"""
Script to add real-time progress tracking to the deployment
"""

# Key changes needed:
print("""
FIXING DEPLOYMENT PROGRESS TRACKING
===================================

Issues:
1. Dashboard shows everything as "pending" 
2. Logs don't update the UI properly
3. No real progress indication

Fix:
1. Add a progress tracking endpoint that returns current step status
2. Update main.py to store progress in Redis with proper structure
3. Update dashboard to poll progress endpoint
""")

# The changes we need to make:

MAIN_PY_CHANGES = """
# Add this new endpoint to main.py:

@app.route('/api/deployment/<deployment_id>/progress')
def get_deployment_progress(deployment_id):
    '''Get real-time deployment progress'''
    if 'user_info' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    # Get basic deployment info
    deployment_ref = db.collection('deployments').document(deployment_id)
    deployment = deployment_ref.get()
    
    if not deployment.exists:
        return jsonify({'error': 'Deployment not found'}), 404
    
    deployment_data = deployment.to_dict()
    
    # Get progress from Redis
    progress = {
        'status': deployment_data.get('status', 'unknown'),
        'current_step': None,
        'steps': {},
        'overall_progress': 0
    }
    
    if REDIS_AVAILABLE and redis_client:
        try:
            # Get current step
            current_step = redis_client.get(f'deployment_current_step:{deployment_id}')
            if current_step:
                progress['current_step'] = current_step.decode('utf-8')
            
            # Get step statuses
            step_data = redis_client.hgetall(f'deployment_step_status:{deployment_id}')
            for step_id, status in step_data.items():
                progress['steps'][step_id.decode('utf-8')] = json.loads(status.decode('utf-8'))
            
            # Calculate overall progress
            total_steps = 9  # Total deployment steps
            completed_steps = sum(1 for s in progress['steps'].values() if s.get('status') == 'completed')
            progress['overall_progress'] = int((completed_steps / total_steps) * 100)
            
        except Exception as e:
            print(f"Error getting progress: {e}")
    
    return jsonify(progress)

# Update the log function to track progress:
def log(message, step_info=None, is_error=False):
    # ... existing code ...
    
    # Track step progress
    if message.startswith('STATUS:'):
        status = message.split('STATUS:')[1].strip()
        
        # Map status to step IDs
        status_to_step = {
            'ENABLING_APIS': 'enabling-apis',
            'SETTING_PERMISSIONS': 'permissions', 
            'PREPARING_TERRAFORM': 'terraform-init',
            'TERRAFORM_INIT': 'terraform-init',
            'CREATING_SERVICE_ACCOUNTS': 'service-accounts',
            'CREATING_SECRETS': 'secrets',
            'CREATING_STORAGE': 'storage',
            'CREATING_FIRESTORE': 'firestore',
            'CREATING_CLOUD_FUNCTIONS': 'functions',
            'CREATING_API_GATEWAY': 'api-gateway'
        }
        
        if status in status_to_step:
            step_id = status_to_step[status]
            
            # Mark previous step as completed
            if redis_client:
                current = redis_client.get(f'deployment_current_step:{deployment_id}')
                if current and current.decode('utf-8') != step_id:
                    prev_step = current.decode('utf-8')
                    redis_client.hset(
                        f'deployment_step_status:{deployment_id}',
                        prev_step,
                        json.dumps({'status': 'completed', 'timestamp': datetime.utcnow().isoformat()})
                    )
                
                # Set new current step
                redis_client.set(f'deployment_current_step:{deployment_id}', step_id)
                redis_client.expire(f'deployment_current_step:{deployment_id}', 86400)
                
                # Mark step as active
                redis_client.hset(
                    f'deployment_step_status:{deployment_id}',
                    step_id,
                    json.dumps({'status': 'active', 'timestamp': datetime.utcnow().isoformat()})
                )
                redis_client.expire(f'deployment_step_status:{deployment_id}', 86400)
"""

DASHBOARD_CHANGES = """
// Replace checkDeploymentStatus with enhanced version:

async function checkDeploymentStatus() {
    if (!deploymentId) return;
    
    try {
        // Get both status and progress
        const [statusResponse, progressResponse] = await Promise.all([
            fetch(`/api/deployment/${deploymentId}`),
            fetch(`/api/deployment/${deploymentId}/progress`)
        ]);
        
        const statusData = await statusResponse.json();
        const progressData = await progressResponse.json();
        
        // Update overall status
        const statusMap = {
            'queued': { icon: '⏳', title: 'Deployment Queued', desc: 'Waiting to start...' },
            'running': { icon: '🔄', title: 'Deploying Infrastructure', desc: 'Creating your resources...' },
            'completed': { icon: '✅', title: 'Deployment Complete!', desc: 'Your infrastructure is ready' },
            'failed': { icon: '❌', title: 'Deployment Failed', desc: statusData.error || 'An error occurred' }
        };
        
        const status = statusMap[statusData.status] || statusMap['queued'];
        updateStatus(statusData.status, status.title, status.desc);
        
        // Update progress bar
        if (progressData.overall_progress !== undefined) {
            document.getElementById('progress-bar').style.width = `${progressData.overall_progress}%`;
        }
        
        // Update step statuses based on progress data
        if (progressData.steps) {
            Object.entries(progressData.steps).forEach(([stepId, stepData]) => {
                updateStepStatus(stepId, stepData.status);
            });
        }
        
        // Highlight current step
        if (progressData.current_step) {
            // Remove previous active highlights
            document.querySelectorAll('.checklist-step.active').forEach(el => {
                if (el.dataset.stepId !== progressData.current_step) {
                    el.classList.remove('active');
                }
            });
            
            // Add active to current
            const currentStepEl = document.querySelector(`[data-step-id="${progressData.current_step}"]`);
            if (currentStepEl) {
                currentStepEl.classList.add('active');
                updateStepStatus(progressData.current_step, 'active');
            }
        }
        
        // Update logs
        if (statusData.logs && statusData.logs.length > 0) {
            updateLogs(statusData.logs);
        }
        
        // Handle completion
        if (statusData.status === 'completed') {
            clearInterval(statusCheckInterval);
            document.getElementById('progress-bar').style.width = '100%';
            
            // Mark all steps as completed
            deploymentSteps.forEach(step => {
                updateStepStatus(step.id, 'completed');
            });
            
            if (statusData.outputs) {
                showResults(statusData.outputs);
            }
        }
        
        // Handle failure
        if (statusData.status === 'failed') {
            clearInterval(statusCheckInterval);
        }
        
    } catch (error) {
        console.error('Status check error:', error);
    }
}

// Update the checklist rendering to include data attributes
function renderChecklist() {
    const checklistEl = document.getElementById('deployment-checklist');
    checklistEl.innerHTML = deploymentSteps.map((step, index) => {
        // ... existing code ...
        return `
            <div class="checklist-step ${statusClass}" data-step-id="${step.id}">
                <!-- existing content -->
            </div>
        `;
    }).join('');
}
"""

print("\nImplementation Plan:")
print("1. Add progress tracking endpoint to main.py")
print("2. Update log function to track step transitions") 
print("3. Update dashboard to poll progress endpoint")
print("4. Add visual indicators for current active step")