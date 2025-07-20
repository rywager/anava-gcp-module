#!/usr/bin/env python3
"""
Example trigger scripts for the phone call app
"""
import requests
import time
import random
from datetime import datetime

# Configuration
API_URL = "http://localhost:5000"  # Change to your app URL
PHONE_NUMBER = "+1234567890"  # Change to your phone number

def simple_trigger():
    """Simple one-time trigger"""
    response = requests.post(f"{API_URL}/trigger-call", json={
        "to_number": PHONE_NUMBER,
        "message": "This is a simple trigger test call."
    })
    print(f"Response: {response.json()}")

def scheduled_trigger(interval_seconds=60):
    """Trigger calls at regular intervals"""
    count = 0
    while True:
        count += 1
        response = requests.post(f"{API_URL}/trigger-call", json={
            "to_number": PHONE_NUMBER,
            "message": f"Scheduled call number {count} at {datetime.now().strftime('%H:%M:%S')}"
        })
        print(f"Call {count}: {response.json()}")
        time.sleep(interval_seconds)

def condition_based_trigger():
    """Trigger based on conditions (example: random event)"""
    while True:
        # Simulate checking a condition
        if random.random() > 0.8:  # 20% chance
            response = requests.post(f"{API_URL}/trigger-call", json={
                "to_number": PHONE_NUMBER,
                "message": "Alert! Condition has been met. Please check your system."
            })
            print(f"Condition triggered: {response.json()}")
        
        time.sleep(10)  # Check every 10 seconds

def webhook_trigger(trigger_type="alert"):
    """Example of using the webhook endpoint"""
    response = requests.post(f"{API_URL}/webhook-trigger", json={
        "to_number": PHONE_NUMBER,
        "message": f"Webhook alert: {trigger_type} detected!",
        "trigger_type": trigger_type
    })
    print(f"Webhook response: {response.json()}")

def monitoring_trigger(threshold=80):
    """Example: CPU/Memory monitoring trigger"""
    import psutil
    
    while True:
        cpu_percent = psutil.cpu_percent(interval=1)
        memory_percent = psutil.virtual_memory().percent
        
        if cpu_percent > threshold:
            response = requests.post(f"{API_URL}/trigger-call", json={
                "to_number": PHONE_NUMBER,
                "message": f"Alert! CPU usage is at {cpu_percent} percent, exceeding threshold of {threshold} percent."
            })
            print(f"CPU Alert sent: {response.json()}")
            time.sleep(300)  # Wait 5 minutes before next alert
        
        if memory_percent > threshold:
            response = requests.post(f"{API_URL}/trigger-call", json={
                "to_number": PHONE_NUMBER,
                "message": f"Alert! Memory usage is at {memory_percent} percent, exceeding threshold of {threshold} percent."
            })
            print(f"Memory Alert sent: {response.json()}")
            time.sleep(300)  # Wait 5 minutes before next alert
        
        time.sleep(30)  # Check every 30 seconds

if __name__ == "__main__":
    print("Phone Call Trigger Examples")
    print("1. Simple trigger")
    print("2. Scheduled trigger (every minute)")
    print("3. Condition-based trigger")
    print("4. Webhook trigger")
    print("5. System monitoring trigger")
    
    choice = input("\nSelect trigger type (1-5): ")
    
    if choice == "1":
        simple_trigger()
    elif choice == "2":
        scheduled_trigger()
    elif choice == "3":
        condition_based_trigger()
    elif choice == "4":
        webhook_trigger()
    elif choice == "5":
        monitoring_trigger()
    else:
        print("Invalid choice")