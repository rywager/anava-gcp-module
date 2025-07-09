#!/usr/bin/env python3
"""
Updates to main.py for enhanced deployment system
Add these endpoints and modifications to the existing main.py
"""

# Add these imports to main.py
from worker_fixed import process_deployment, cancel_deployment, get_deployment_status, health_check as worker_health

# Add these new endpoints to main.py

@app.route('/api/deployment/<deployment_id>/cancel', methods=['POST'])
def cancel_deployment_endpoint(deployment_id):
    """Cancel an active deployment"""
    if not session.get('user'):
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        # Verify ownership
        db = firestore.Client()
        deployment = db.collection('deployments').document(deployment_id).get()
        
        if not deployment.exists:
            return jsonify({'error': 'Deployment not found'}), 404
        
        deployment_data = deployment.to_dict()
        if deployment_data.get('user_email') != session['user']['email']:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Cancel the deployment
        cancelled = cancel_deployment(deployment_id)
        
        if cancelled:
            # Update Firestore
            db.collection('deployments').document(deployment_id).update({
                'status': 'cancelled',
                'cancelled_at': firestore.SERVER_TIMESTAMP
            })
            
            return jsonify({
                'status': 'success',
                'message': 'Deployment cancellation initiated'
            })
        else:
            return jsonify({
                'status': 'info',
                'message': 'Deployment not currently active'
            })
            
    except Exception as e:
        logger.error(f"Error cancelling deployment: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/deployment/<deployment_id>/logs/stream')
def stream_deployment_logs(deployment_id):
    """Stream deployment logs in real-time using Server-Sent Events"""
    if not session.get('user'):
        return jsonify({'error': 'Not authenticated'}), 401
    
    def generate():
        db = firestore.Client()
        last_timestamp = None
        
        while True:
            try:
                # Get new log entries from Firestore
                query = db.collection('deployment_logs').document(deployment_id).collection('entries')
                
                if last_timestamp:
                    query = query.where('created_at', '>', last_timestamp)
                
                logs = query.order_by('created_at').limit(10).stream()
                
                for log in logs:
                    log_data = log.to_dict()
                    last_timestamp = log_data.get('created_at')
                    
                    # Send as Server-Sent Event
                    yield f"data: {json.dumps(log_data)}\n\n"
                
                # Check if deployment is complete
                deployment = db.collection('deployments').document(deployment_id).get()
                if deployment.exists:
                    status = deployment.to_dict().get('status')
                    if status in ['completed', 'failed', 'cancelled']:
                        yield f"data: {json.dumps({'type': 'end', 'status': status})}\n\n"
                        break
                
            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
            
            time.sleep(1)  # Poll every second
    
    return Response(generate(), mimetype='text/event-stream')

@app.route('/api/worker/process', methods=['POST'])
def process_worker_enhanced():
    """Enhanced worker process endpoint using the fixed worker"""
    try:
        # Get job from Redis queue
        job_data = r.lpop('deployment_queue')
        
        if not job_data:
            return jsonify({'status': 'no_jobs', 'message': 'No jobs in queue'})
        
        deployment_data = json.loads(job_data)
        deployment_id = deployment_data['deployment_id']
        
        # Check if deployment is already being processed
        status = get_deployment_status(deployment_id)
        if status and status['status'] == 'running':
            # Put job back in queue
            r.lpush('deployment_queue', job_data)
            return jsonify({
                'status': 'already_processing',
                'message': f'Deployment {deployment_id} is already being processed'
            })
        
        # Process deployment in background thread
        thread = threading.Thread(
            target=process_deployment,
            args=(deployment_data,)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'status': 'processing',
            'deployment_id': deployment_id,
            'message': 'Deployment processing started'
        })
        
    except Exception as e:
        logger.error(f"Worker process error: {e}")
        return jsonify({'error': str(e)}), 500

@app.route('/api/worker/health')
def worker_health_check():
    """Check worker health status"""
    try:
        health = worker_health()
        return jsonify({
            **health,
            'timestamp': datetime.utcnow().isoformat()
        })
    except Exception as e:
        return jsonify({
            'healthy': False,
            'error': str(e)
        }), 500

@app.route('/api/deployment/<deployment_id>/artifacts')
def get_deployment_artifacts(deployment_id):
    """Get deployment artifacts from Cloud Storage"""
    if not session.get('user'):
        return jsonify({'error': 'Not authenticated'}), 401
    
    try:
        # Verify ownership
        db = firestore.Client()
        deployment = db.collection('deployments').document(deployment_id).get()
        
        if not deployment.exists:
            return jsonify({'error': 'Deployment not found'}), 404
        
        deployment_data = deployment.to_dict()
        if deployment_data.get('user_email') != session['user']['email']:
            return jsonify({'error': 'Unauthorized'}), 403
        
        # Get artifacts from Cloud Storage
        storage_client = storage.Client()
        bucket = storage_client.bucket(f"{PROJECT_ID}-deployment-logs")
        
        artifacts = []
        prefix = f"deployments/{deployment_id}/"
        
        for blob in bucket.list_blobs(prefix=prefix):
            artifacts.append({
                'name': blob.name.replace(prefix, ''),
                'size': blob.size,
                'created': blob.time_created.isoformat(),
                'url': blob.generate_signed_url(
                    expiration=timedelta(hours=1),
                    method='GET'
                )
            })
        
        return jsonify({
            'deployment_id': deployment_id,
            'artifacts': artifacts
        })
        
    except Exception as e:
        logger.error(f"Error getting artifacts: {e}")
        return jsonify({'error': str(e)}), 500

# Update the health check endpoint
@app.route('/health')
def health_enhanced():
    """Enhanced health check with worker status"""
    try:
        # Test Redis connection
        r.ping()
        redis_status = 'connected'
        queue_length = r.llen('deployment_queue')
    except:
        redis_status = 'disconnected'
        queue_length = -1
    
    # Get worker health
    try:
        worker_status = worker_health()
    except:
        worker_status = {'healthy': False}
    
    return jsonify({
        'service': 'anava-deploy',
        'status': 'healthy',
        'timestamp': datetime.utcnow().isoformat(),
        'redis_status': redis_status,
        'queue_length': queue_length,
        'worker': worker_status,
        'oauth_configured': all([
            CLIENT_ID,
            CLIENT_SECRET,
            REDIRECT_URI
        ]),
        'redirect_uri': REDIRECT_URI
    })

# Add WebSocket support for real-time updates (optional enhancement)
from flask_socketio import SocketIO, emit, join_room, leave_room

# Initialize SocketIO
socketio = SocketIO(app, cors_allowed_origins="*")

@socketio.on('subscribe_deployment')
def handle_deployment_subscription(data):
    """Subscribe to real-time deployment updates"""
    deployment_id = data.get('deployment_id')
    if deployment_id:
        join_room(f'deployment_{deployment_id}')
        emit('subscribed', {'deployment_id': deployment_id})

@socketio.on('unsubscribe_deployment')
def handle_deployment_unsubscription(data):
    """Unsubscribe from deployment updates"""
    deployment_id = data.get('deployment_id')
    if deployment_id:
        leave_room(f'deployment_{deployment_id}')
        emit('unsubscribed', {'deployment_id': deployment_id})

# Function to emit real-time updates (call from worker)
def emit_deployment_update(deployment_id, update_data):
    """Emit real-time update to subscribed clients"""
    socketio.emit('deployment_update', update_data, room=f'deployment_{deployment_id}')