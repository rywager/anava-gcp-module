#!/bin/bash

# Start a background loop that triggers the worker every 5 seconds
while true; do
    # Try to process a job
    curl -s -X POST http://localhost:8080/api/worker/process > /dev/null 2>&1
    
    # Sleep for 5 seconds
    sleep 5
done &

# Start the main application
exec "$@"