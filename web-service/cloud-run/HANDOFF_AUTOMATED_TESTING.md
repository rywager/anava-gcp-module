# Handoff: Automated Deployment Testing with Puppeteer MCP

## Current Status (v2.3.30)
The deployment service is working but needs automated testing to catch and fix edge cases.

### What's Working:
- ✅ Basic deployments complete successfully
- ✅ Resources are created (Firebase, Storage, Functions, etc.)
- ✅ Region variable fix deployed (v2.3.30)
- ✅ Dashboard shows all configuration values aligned with ACAP
- ✅ ACAP configuration API endpoint available

### Known Issues:
1. **API Gateway Permissions**: Service agent needs manual permission grant (expected)
2. **Redis Connection**: Sometimes times out but falls back to in-memory storage
3. **Edge Cases**: Need to discover through automated testing

## Automated Testing Setup

### Puppeteer MCP Server
The user will have Puppeteer MCP server configured and available. This provides browser automation capabilities.

### Test Strategy
1. **Automated Loop**:
   - Use Puppeteer to navigate to https://anava-deploy-392865621461.us-central1.run.app
   - Log in automatically (user will provide credentials structure)
   - Select project "thisworkstoo" 
   - Click "Deploy Infrastructure"
   - Monitor logs in real-time
   - Detect errors
   - Fix issues
   - Deploy fixes
   - Repeat

2. **Error Detection**:
   - Monitor deployment logs for ERROR, FAILED, Exception
   - Track resource creation progress
   - Identify timeout issues
   - Catch undefined variables, missing imports, etc.

3. **Auto-Fix Workflow**:
   - Detect error pattern
   - Identify fix needed
   - Update main.py
   - Increment version
   - Deploy fix
   - Test again automatically

## Files to Reference

### Main Application
- `/Users/ryanwager/terraform-installer/web-service/cloud-run/main.py` - Main Flask app (v2.3.30)
- `/Users/ryanwager/terraform-installer/web-service/cloud-run/templates/dashboard.html` - UI

### Testing Tools Created
- `/Users/ryanwager/terraform-installer/web-service/cloud-run/automated_test_loop.py` - Testing framework (needs Puppeteer integration)

### Documentation
- Previous handoff docs in same directory for context

## Immediate Tasks

1. **Learn Puppeteer MCP**:
   ```python
   # Check available MCP tools
   ListMcpResourcesTool()
   
   # Look for puppeteer-specific tools like:
   # - navigate(url)
   # - click(selector) 
   # - type(selector, text)
   # - screenshot()
   # - evaluate(js_code)
   ```

2. **Create Automated Test Loop**:
   ```python
   # Pseudo-code for the automation
   while True:
       # Navigate to service
       navigate("https://anava-deploy-392865621461.us-central1.run.app")
       
       # Start deployment
       click("#project-select")
       select_option("thisworkstoo")
       click(".deploy-button")
       
       # Get deployment ID from logs
       deployment_id = monitor_for_deployment_start()
       
       # Monitor progress
       errors = monitor_deployment_logs(deployment_id)
       
       # Fix any errors found
       if errors:
           fix = analyze_and_create_fix(errors)
           deploy_fix(fix)
       
       # Wait and repeat
       time.sleep(30)
   ```

3. **Common Fixes to Automate**:
   - Undefined variables (add proper assignments)
   - Missing imports (add to imports section)
   - Timeout issues (increase timeouts)
   - API errors (add better error handling)

## Success Criteria
- Run 10+ successful deployments in a row without manual intervention
- All resources created successfully
- Proper error handling for all edge cases
- Dashboard shows complete configuration
- Downloads work properly

## Deployment Commands
```bash
# Quick deploy after fix
git add -A && git commit -m "v2.3.X: [Fix description]"
gcloud builds submit --tag gcr.io/anava-ai/anava-deploy:v2.3.X --async
# Wait for build then:
gcloud run deploy anava-deploy --image gcr.io/anava-ai/anava-deploy:v2.3.X --region us-central1

# Or use the deploy script:
./deploy_to_production.sh
```

## Key Patterns to Watch For
1. **Terraform State**: Sometimes gets corrupted - may need cleanup
2. **Permissions**: Service agents need specific roles
3. **Timeouts**: Operations may take longer than expected
4. **Race Conditions**: Firebase operations sometimes need delays

## Next Session Prompt

"I need to set up automated deployment testing using Puppeteer MCP. The deployment service is at https://anava-deploy-392865621461.us-central1.run.app (v2.3.30). 

First, check what Puppeteer MCP tools are available, then create an automated testing loop that:
1. Navigates to the service and logs in
2. Starts a deployment with project 'thisworkstoo'
3. Monitors the logs for errors
4. Fixes any issues found
5. Deploys the fixes
6. Repeats until deployments work perfectly

All context is in /Users/ryanwager/terraform-installer/web-service/cloud-run/HANDOFF_AUTOMATED_TESTING.md"