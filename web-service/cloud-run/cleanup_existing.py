#!/usr/bin/env python3
"""
Cleanup existing resources before deployment
"""
import subprocess
import json
import time

def cleanup_resources(project_id, prefix, log_func):
    """Remove existing resources that conflict with deployment"""
    
    log_func("STATUS: CLEANING_EXISTING_RESOURCES")
    log_func("ACTION: Removing existing resources to ensure clean deployment...")
    
    cleaned = 0
    
    # 0. Delete API Gateway resources first (they block other deletions)
    log_func("INFO: Cleaning API Gateway resources...")
    
    # Delete API Gateways
    try:
        list_cmd = ['gcloud', 'api-gateway', 'gateways', 'list',
                    '--format=value(name)', f'--project={project_id}']
        result = subprocess.run(list_cmd, capture_output=True, text=True)
        if result.returncode == 0 and result.stdout:
            for gateway in result.stdout.strip().split('\n'):
                if gateway:
                    log_func(f"CLEANING: API Gateway {gateway}")
                    # Extract location from gateway name
                    location = 'us-central1'  # default
                    cmd = ['gcloud', 'api-gateway', 'gateways', 'delete', gateway,
                           f'--location={location}', f'--project={project_id}', '--quiet']
                    subprocess.run(cmd, capture_output=True, text=True)
                    cleaned += 1
    except Exception as e:
        log_func(f"WARNING: Error cleaning gateways: {str(e)[:100]}")
    
    # Delete API Configs
    try:
        list_cmd = ['gcloud', 'api-gateway', 'apis', 'list',
                    '--format=value(name)', f'--project={project_id}']
        result = subprocess.run(list_cmd, capture_output=True, text=True)
        if result.returncode == 0 and result.stdout:
            for api in result.stdout.strip().split('\n'):
                if api and prefix in api:
                    log_func(f"CLEANING: API {api}")
                    cmd = ['gcloud', 'api-gateway', 'apis', 'delete', api,
                           f'--project={project_id}', '--quiet']
                    subprocess.run(cmd, capture_output=True, text=True)
                    cleaned += 1
    except Exception as e:
        log_func(f"WARNING: Error cleaning APIs: {str(e)[:100]}")
    
    # Delete API Keys
    try:
        list_cmd = ['gcloud', 'services', 'api-keys', 'list',
                    '--format=value(name)', f'--project={project_id}']
        result = subprocess.run(list_cmd, capture_output=True, text=True)
        if result.returncode == 0 and result.stdout:
            for key in result.stdout.strip().split('\n'):
                if key and prefix in key:
                    log_func(f"CLEANING: API Key {key}")
                    cmd = ['gcloud', 'services', 'api-keys', 'delete', key,
                           f'--project={project_id}', '--quiet']
                    subprocess.run(cmd, capture_output=True, text=True)
                    cleaned += 1
    except Exception as e:
        log_func(f"WARNING: Error cleaning API keys: {str(e)[:100]}")
    
    # 1. Delete service accounts
    service_accounts = [
        f"{prefix}-device-auth-sa",
        f"{prefix}-tvm-sa",
        f"{prefix}-vertex-ai-sa",
        f"{prefix}-apigw-invoker-sa"
    ]
    
    for sa in service_accounts:
        sa_email = f"{sa}@{project_id}.iam.gserviceaccount.com"
        cmd = ['gcloud', 'iam', 'service-accounts', 'delete', sa_email, 
               f'--project={project_id}', '--quiet']
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            log_func(f"CLEANED: Removed service account {sa}")
            cleaned += 1
    
    # 2. Delete storage buckets
    buckets = [
        f"{project_id}-{prefix}-function-source",
        f"{project_id}-{prefix}-firebase"
    ]
    
    for bucket in buckets:
        # First empty the bucket
        empty_cmd = ['gsutil', '-m', 'rm', '-r', f'gs://{bucket}/**']
        subprocess.run(empty_cmd, capture_output=True, text=True)
        
        # Then delete it
        cmd = ['gsutil', 'rb', f'gs://{bucket}']
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            log_func(f"CLEANED: Removed storage bucket {bucket}")
            cleaned += 1
    
    # 3. Delete secrets
    secrets = [
        f"{prefix}-firebase-config",
        f"{prefix}-api-key"
    ]
    
    for secret in secrets:
        cmd = ['gcloud', 'secrets', 'delete', secret, 
               f'--project={project_id}', '--quiet']
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            log_func(f"CLEANED: Removed secret {secret}")
            cleaned += 1
    
    # 4. Delete Cloud Functions (v2)
    try:
        list_cmd = ['gcloud', 'functions', 'list', 
                    f'--project={project_id}', '--format=value(name)']
        result = subprocess.run(list_cmd, capture_output=True, text=True)
        if result.returncode == 0 and result.stdout:
            for fn in result.stdout.strip().split('\n'):
                if fn and prefix in fn:
                    log_func(f"CLEANING: Cloud Function {fn}")
                    # Extract region from function name if needed
                    region = 'us-central1'  # default region
                    cmd = ['gcloud', 'functions', 'delete', fn, 
                           f'--region={region}', f'--project={project_id}', '--quiet']
                    subprocess.run(cmd, capture_output=True, text=True)
                    cleaned += 1
    except Exception as e:
        log_func(f"WARNING: Error cleaning functions: {str(e)[:100]}")
    
    # Also try Cloud Functions v2
    try:
        list_cmd = ['gcloud', 'run', 'services', 'list', 
                    f'--project={project_id}', '--format=value(metadata.name)']
        result = subprocess.run(list_cmd, capture_output=True, text=True)
        if result.returncode == 0 and result.stdout:
            for service in result.stdout.strip().split('\n'):
                if service and prefix in service and 'fn' in service:
                    log_func(f"CLEANING: Cloud Run Function {service}")
                    region = 'us-central1'  # default region
                    cmd = ['gcloud', 'run', 'services', 'delete', service,
                           f'--region={region}', f'--project={project_id}', '--quiet']
                    subprocess.run(cmd, capture_output=True, text=True)
                    cleaned += 1
    except Exception as e:
        log_func(f"WARNING: Error cleaning Cloud Run functions: {str(e)[:100]}")
    
    # 5. Delete API Gateway
    try:
        # List gateways
        list_cmd = ['gcloud', 'api-gateway', 'gateways', 'list',
                    '--filter', f'displayName:{prefix}*',
                    f'--project={project_id}', '--format=json']
        result = subprocess.run(list_cmd, capture_output=True, text=True)
        if result.returncode == 0 and result.stdout:
            gateways = json.loads(result.stdout)
            for gw in gateways:
                gw_id = gw['name'].split('/')[-1]
                region = gw['name'].split('/')[3]
                
                cmd = ['gcloud', 'api-gateway', 'gateways', 'delete', gw_id,
                       f'--location={region}', f'--project={project_id}', '--quiet']
                subprocess.run(cmd, capture_output=True, text=True)
                log_func(f"CLEANED: Removed API Gateway {gw_id}")
                cleaned += 1
    except:
        pass
    
    # 6. Delete API configs
    try:
        list_cmd = ['gcloud', 'api-gateway', 'api-configs', 'list',
                    '--api', f'{prefix}-api',
                    f'--project={project_id}', '--format=json']
        result = subprocess.run(list_cmd, capture_output=True, text=True)
        if result.returncode == 0 and result.stdout:
            configs = json.loads(result.stdout)
            for cfg in configs:
                cfg_id = cfg['name'].split('/')[-1]
                
                cmd = ['gcloud', 'api-gateway', 'api-configs', 'delete', cfg_id,
                       '--api', f'{prefix}-api',
                       f'--project={project_id}', '--quiet']
                subprocess.run(cmd, capture_output=True, text=True)
                log_func(f"CLEANED: Removed API config {cfg_id}")
                cleaned += 1
    except:
        pass
    
    # 7. Delete API
    try:
        cmd = ['gcloud', 'api-gateway', 'apis', 'delete', f'{prefix}-api',
               f'--project={project_id}', '--quiet']
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            log_func(f"CLEANED: Removed API {prefix}-api")
            cleaned += 1
    except:
        pass
    
    # 8. Delete Workload Identity Pool
    try:
        cmd = ['gcloud', 'iam', 'workload-identity-pools', 'delete',
               f'{prefix}-wif-pool', '--location=global',
               f'--project={project_id}', '--quiet']
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            log_func(f"CLEANED: Removed Workload Identity Pool")
            cleaned += 1
    except:
        pass
    
    if cleaned > 0:
        log_func(f"SUCCESS: Cleaned {cleaned} existing resources")
        log_func("INFO: Waiting 10 seconds for deletions to propagate...")
        time.sleep(10)
    else:
        log_func("INFO: No existing resources found to clean")
    
    return cleaned