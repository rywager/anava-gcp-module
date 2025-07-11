# New Session Prompt - Critical Anava Deployment Service Fixes

## Your Mission
You need to fix two critical issues in the Anava deployment service (v2.3.21) that are preventing deployments from working properly. The service is currently deployed on Google Cloud Run and users are unable to see logs or complete deployments due to these issues.

## Context
- **Working Directory**: `/Users/ryanwager/terraform-installer/web-service/cloud-run`
- **Main File**: `main.py`
- **Current Branch**: `security-architecture-audit`
- **Service**: Anava Cloud Deployment Service running on Cloud Run

## Critical Issue 1: Redis Connection Failure (URGENT)

### The Problem
Users cannot see any deployment logs in the UI because Redis connection is failing. The service falls back to synchronous mode but doesn't send logs to the UI.

### Symptoms
- Redis host configured as: `10.77.208.3` (private IP)
- Connection fails with timeout
- Log shows: `Processing deployment 97a66c58-41f3-492f-af8d-c4ccec8b9297 synchronously (Redis unavailable)`
- UI shows: `Redis unavailable - check Cloud Run logs`

### What You Need to Do
1. **First**: Find the Redis connection code in `main.py` (search for "Redis unavailable" around line 1142)
2. **Add detailed error logging** to understand why the connection is failing:
   ```python
   try:
       # Redis connection attempt
   except Exception as e:
       log(f"Redis connection failed: {type(e).__name__}: {str(e)}")
       log(f"Redis host: {redis_host}, port: {redis_port}")
   ```

3. **Check VPC connectivity** - The Redis IP (10.77.208.3) is private, suggesting VPC setup:
   - Cloud Run needs a VPC connector to reach private IPs
   - Add diagnostic code to test connectivity

4. **Implement a proper fallback**:
   - Store logs in memory or Cloud Logging when Redis is down
   - Add retry logic with exponential backoff
   - Ensure logs are still accessible to users somehow

## Critical Issue 2: Resource Cleanup Not Working

### The Problem
The cleanup function runs but doesn't actually delete existing resources, causing all deployments to fail with "already exists" errors.

### Symptoms
- Status shows: `CLEANING_EXISTING_RESOURCES`
- But NO resources are actually deleted
- No `CLEANED:` messages in logs
- Subsequent deployments fail with "already exists" errors
- Commands are failing silently without any error logs

### What You Need to Do
1. **First**: Find the cleanup implementation in `main.py` (search for "CLEANING_EXISTING_RESOURCES" around line 515)

2. **Add comprehensive error logging** to ALL subprocess.run() calls:
   ```python
   # Find patterns like this:
   result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
   
   # Add error handling:
   result = subprocess.run(cmd, shell=True, capture_output=True, text=True)
   if result.returncode != 0:
       log(f"ERROR: Cleanup command failed: {' '.join(cmd)}")
       log(f"STDERR: {result.stderr}")
       log(f"STDOUT: {result.stdout}")
       log(f"Return code: {result.returncode}")
   else:
       log(f"SUCCESS: Cleaned {resource_type}: {resource_name}")
   ```

3. **Fix the gcloud commands**:
   - Add `--quiet` flag to skip confirmation prompts
   - Add explicit `--project={project_id}` flag
   - Example fix:
     ```python
     # Before:
     cmd = f"gcloud iam service-accounts delete {sa_email}"
     
     # After:
     cmd = f"gcloud iam service-accounts delete {sa_email} --quiet --project={project_id}"
     ```

4. **Check for these common issues**:
   - Service account might lack permissions
   - Commands might need different syntax in Cloud Run environment
   - Resource dependencies (some resources must be deleted before others)

## Step-by-Step Approach

1. **Start by reading the code**:
   ```bash
   # Find and read the Redis connection code
   grep -n "Redis unavailable" main.py
   
   # Find and read the cleanup code
   grep -n "CLEANING_EXISTING_RESOURCES" main.py
   ```

2. **Add logging first** - We need visibility into what's failing

3. **Test minimal fixes**:
   - For Redis: Just add error details first
   - For cleanup: Add error logging to one resource type first

4. **Iterate based on the actual errors** you discover

## Testing Your Fixes

### For Redis:
- The fix is working when you see specific error messages like "Connection timeout to 10.77.208.3:6379" instead of just "Redis unavailable"
- Bonus: Logs still work somehow even when Redis is down

### For Cleanup:
- The fix is working when you see either:
  - `SUCCESS: Cleaned service_account: xyz@project.iam.gserviceaccount.com`
  - `ERROR: Cleanup command failed: gcloud iam service-accounts delete...` with specific error details

## Important Notes

1. **Don't break existing functionality** - Add logging without changing the core flow
2. **This is running on Cloud Run** - No persistent local storage
3. **Users are actively hitting these errors** - Focus on diagnostic logging first
4. **The cleanup issue is likely permissions or command syntax** - The logging will reveal which

## Deliverables

1. **Updated main.py** with:
   - Comprehensive error logging for Redis connection
   - Detailed error logging for all cleanup commands
   - Specific error messages that explain what's failing

2. **Root cause analysis** based on the error logs you add

3. **Specific fixes** for both issues once you understand the actual errors

4. **Test commands** to verify the fixes work

## Remember
- The immediate goal is to add logging to understand WHY things are failing
- Once we see the actual errors, the fixes will be obvious
- Don't try to fix everything at once - add logging, understand the problem, then fix

Start by examining the main.py file and finding these two critical sections!