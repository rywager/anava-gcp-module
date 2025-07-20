#\!/usr/bin/env python3
import subprocess
import json
import time
from datetime import datetime, timedelta

print("🔍 Monitoring for deployment activity...")
seen_messages = set()

while True:
    timestamp = (datetime.utcnow() - timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
    cmd = f'gcloud logging read \'resource.type="cloud_run_revision" resource.labels.service_name="anava-deploy" timestamp>="{timestamp}"\' --project=anava-ai --limit=50 --format=json'
    
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        if result.returncode == 0 and result.stdout:
            logs = json.loads(result.stdout)
            for log in logs:
                payload = log.get('jsonPayload', {})
                message = payload.get('message', '')
                
                if message and message not in seen_messages:
                    seen_messages.add(message)
                    ts = log.get('timestamp', '').split('.')[0]
                    status = payload.get('status', 'LOG')
                    
                    if 'ERROR' in message or 'FAILED' in message:
                        print(f"❌ {ts} [{status}] {message}")
                    elif 'SUCCESS' in message or 'COMPLETE' in message:
                        print(f"✅ {ts} [{status}] {message}")
                    elif any(x in message for x in ['TERRAFORM', 'CREATING', 'APPLYING']):
                        print(f"🔧 {ts} [{status}] {message}")
    except Exception as e:
        pass
    
    time.sleep(5)
