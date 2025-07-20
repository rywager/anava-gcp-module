#!/bin/bash

# Automated deployment test loop
# This script will repeatedly test the deployment flow

echo "=== Automated Deployment Test Loop ==="
echo "This will test the deployment flow repeatedly"
echo "Press Ctrl+C to stop"
echo ""

TEST_PROJECT="testies123"
ITERATIONS=5
DELAY_BETWEEN_TESTS=60  # seconds

# Create test results directory
mkdir -p test-results

# Log file
LOG_FILE="test-results/auto-test-$(date +%Y%m%d-%H%M%S).log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

# Function to run a single test iteration
run_test() {
    local iteration=$1
    log "=== Starting Test Iteration $iteration ==="
    
    # Use osascript to interact with the Electron app
    osascript <<EOF
tell application "System Events"
    -- Bring Electron app to front
    set frontmost of first process whose name contains "Electron" to true
    delay 2
    
    -- Click on project dropdown (you may need to adjust coordinates)
    -- This is a placeholder - actual implementation would need proper element identification
    
    -- For now, just log that we would interact here
    do shell script "echo '[$(date)] Would select project $TEST_PROJECT' >> $LOG_FILE"
end tell
EOF
    
    # Instead, let's use a JavaScript snippet that can be run in DevTools
    cat > temp-test.js <<'EOJS'
(async function runTest() {
    console.log('[AUTO TEST] Starting test iteration...');
    
    try {
        // Check current project
        const currentProject = await window.electronAPI.store.get('gcpProjectId');
        console.log('[AUTO TEST] Current project:', currentProject);
        
        // List projects
        const projects = await window.electronAPI.gcpAPI.listProjects();
        console.log('[AUTO TEST] Found', projects.length, 'projects');
        
        // Check billing for test project
        const testProject = 'testies123';
        console.log('[AUTO TEST] Checking billing for:', testProject);
        const billingResult = await window.electronAPI.gcpAPI.checkBilling(testProject);
        console.log('[AUTO TEST] Billing result:', billingResult);
        
        // Log to file
        const fs = require('fs');
        const logEntry = `[${new Date().toISOString()}] Test completed - Project: ${testProject}, Billing: ${billingResult.enabled}\n`;
        fs.appendFileSync('test-results/console-test.log', logEntry);
        
        return { success: true, billing: billingResult };
    } catch (error) {
        console.error('[AUTO TEST] Error:', error);
        return { success: false, error: error.message };
    }
})();
EOJS
    
    log "Test script created. To run it:"
    log "1. Open DevTools in the Electron app (Cmd+Option+I)"
    log "2. Paste the contents of temp-test.js into the console"
    log "3. Watch for [AUTO TEST] messages"
    
    # Monitor for billing checks in the logs
    log "Monitoring for billing checks..."
    tail -20 ~/Library/Logs/anava-vision-desktop/main.log | grep -i "billing" | while read line; do
        log "BILLING LOG: $line"
    done
    
    log "Test iteration $iteration completed"
}

# Main test loop
log "Starting automated test loop"
log "Test project: $TEST_PROJECT"
log "Iterations: $ITERATIONS"
log "Delay between tests: $DELAY_BETWEEN_TESTS seconds"

for i in $(seq 1 $ITERATIONS); do
    run_test $i
    
    if [ $i -lt $ITERATIONS ]; then
        log "Waiting $DELAY_BETWEEN_TESTS seconds before next test..."
        sleep $DELAY_BETWEEN_TESTS
    fi
done

log "=== Test loop completed ==="
log "Results saved to: $LOG_FILE"

# Summary
echo ""
echo "Test Summary:"
echo "-------------"
grep -c "BILLING LOG:" "$LOG_FILE" | xargs echo "Total billing checks:"
grep -c "enabled: true" "$LOG_FILE" | xargs echo "Successful billing checks:"
grep -c "Error:" "$LOG_FILE" | xargs echo "Errors encountered:"