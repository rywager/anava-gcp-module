#!/usr/bin/env python3
"""Check recent deployments in Firestore"""

from google.cloud import firestore
from datetime import datetime, timedelta
import json

db = firestore.Client()

# Get deployments from last 2 hours
cutoff_time = datetime.utcnow() - timedelta(hours=2)

deployments = db.collection('deployments')\
    .where('createdAt', '>=', cutoff_time)\
    .order_by('createdAt', direction=firestore.Query.DESCENDING)\
    .limit(10)\
    .stream()

print("Recent Deployments (last 2 hours):")
print("=" * 80)

count = 0
for doc in deployments:
    count += 1
    data = doc.to_dict()
    created = data.get('createdAt', 'Unknown')
    if isinstance(created, datetime):
        created = created.strftime('%Y-%m-%d %H:%M:%S UTC')
    
    print(f"\nDeployment ID: {doc.id}")
    print(f"Created: {created}")
    print(f"Status: {data.get('status', 'Unknown')}")
    print(f"Project: {data.get('projectId', 'Unknown')}")
    print(f"User: {data.get('user', 'Unknown')}")
    print(f"Error: {data.get('error', 'None')}")

if count == 0:
    print("\nNo deployments found in the last 2 hours.")
else:
    print(f"\n\nTotal: {count} deployments")