#!/bin/bash

# Monitor deployment progress
echo "=== Deployment Monitor Started ==="
echo "Monitoring logs for deployment activity..."
echo "Press Ctrl+C to stop"
echo ""

# Create results directory
mkdir -p deployment-results

# Log file with timestamp
LOG_FILE="deployment-results/monitor-$(date +%Y%m%d-%H%M%S).log"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Monitor main electron log
log "Starting deployment monitor..."
log "Watching: ~/Library/Logs/anava-vision-desktop/main.log"
log "Results will be saved to: $LOG_FILE"
echo ""

# Track deployment status
DEPLOYMENT_COUNT=0
SUCCESS_COUNT=0
FAILURE_COUNT=0

# Monitor log file
tail -f ~/Library/Logs/anava-vision-desktop/main.log | while read line; do
    # Check for billing checks
    if echo "$line" | grep -i "billing" > /dev/null; then
        log "BILLING: $line"
    fi
    
    # Check for deployment start
    if echo "$line" | grep -i "terraform.*deploy.*called" > /dev/null; then
        DEPLOYMENT_COUNT=$((DEPLOYMENT_COUNT + 1))
        log "🚀 DEPLOYMENT STARTED #$DEPLOYMENT_COUNT"
    fi
    
    # Check for terraform progress
    if echo "$line" | grep -i "terraform:progress" > /dev/null; then
        log "📊 PROGRESS: $line"
    fi
    
    # Check for deployment completion
    if echo "$line" | grep -i "terraform:complete" > /dev/null; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
        log "✅ DEPLOYMENT COMPLETED! (Success: $SUCCESS_COUNT)"
    fi
    
    # Check for errors
    if echo "$line" | grep -iE "(terraform:error|deployment.*failed|error.*deploy)" > /dev/null; then
        FAILURE_COUNT=$((FAILURE_COUNT + 1))
        log "❌ DEPLOYMENT ERROR! (Failures: $FAILURE_COUNT)"
        log "   Error: $line"
    fi
    
    # Check for API Gateway URLs (successful deployment indicator)
    if echo "$line" | grep -i "api.*gateway.*url" > /dev/null; then
        log "🌐 API Gateway: $line"
    fi
    
    # Print summary every 10 minutes
    if [ $(($(date +%s) % 600)) -eq 0 ]; then
        echo ""
        log "=== Status Summary ==="
        log "Total Deployments: $DEPLOYMENT_COUNT"
        log "Successful: $SUCCESS_COUNT"
        log "Failed: $FAILURE_COUNT"
        echo ""
    fi
done