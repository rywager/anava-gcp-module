#!/usr/bin/env python3
"""
Worker process that imports deployment logic from main.py
"""

from main import run_single_deployment
import os
import json
import redis
from google.cloud import firestore
from datetime import datetime

# Redis for job tracking
redis_client = redis.StrictRedis(
    host=os.environ.get('REDIS_HOST', 'localhost'),
    port=int(os.environ.get('REDIS_PORT', 6379)),
    decode_responses=True
)

# Firestore for deployment records
db = firestore.Client()

def run_deployment_worker():
    """Background worker process"""
    print("Deployment worker started and waiting for jobs...")
    
    while True:
        try:
            # Wait for job
            job_json = redis_client.brpop('deployment_queue', timeout=5)
            if not job_json:
                continue
            
            print(f"Got deployment job: {job_json[0]}")
            job_data = json.loads(job_json[1])
            
            # Run the deployment using the function from main.py
            run_single_deployment(job_data)
            
        except Exception as e:
            print(f"Worker error: {e}")
            continue

if __name__ == '__main__':
    run_deployment_worker()