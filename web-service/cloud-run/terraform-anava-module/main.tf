/**
 * Anava GCP Terraform Module
 * 
 * This module creates the complete infrastructure for Anava ACAP cloud backend
 * based on the original vertexSetup_gcp.sh script.
 * 
 * Resources created:
 * - Firebase project with Firestore database
 * - Firebase Storage bucket with security rules
 * - Cloud Functions (device-auth and token-vending-machine)
 * - API Gateway with OpenAPI specification
 * - Service accounts with proper IAM permissions
 * - Workload Identity Federation for token exchange
 * - Secret Manager secrets for configuration
 */

# Terraform configuration moved to versions.tf to avoid duplication

# Enable required APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "firebase.googleapis.com",
    "identitytoolkit.googleapis.com",
    "storage.googleapis.com",
    "firebasestorage.googleapis.com",
    "sts.googleapis.com",
    "aiplatform.googleapis.com",
    "cloudfunctions.googleapis.com",
    "run.googleapis.com",
    "apigateway.googleapis.com",
    "secretmanager.googleapis.com",
    "firestore.googleapis.com",
    "compute.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com",
    "serviceusage.googleapis.com",
    "servicemanagement.googleapis.com",
    "endpoints.googleapis.com"
  ])

  project = var.project_id
  service = each.value

  disable_dependent_services = false
  disable_on_destroy        = false
}

# Get project number
data "google_project" "project" {
  project_id = var.project_id
}

# Firebase project
resource "google_firebase_project" "default" {
  provider = google-beta
  project  = var.project_id

  depends_on = [google_project_service.required_apis]
}

# Firestore database named "anava"
# Using default Firestore database - no need to create one

# Create the actual storage bucket first
resource "google_storage_bucket" "firebase_bucket" {
  project  = var.project_id
  name     = "${var.project_id}-${var.solution_prefix}-firebase"
  location = var.storage_location != "" ? var.storage_location : "US"
  
  uniform_bucket_level_access = true
  force_destroy = false
  
  versioning {
    enabled = true
  }
  
  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD", "PUT", "POST", "DELETE"]
    response_header = ["*"]
    max_age_seconds = 3600
  }
  
  lifecycle {
    ignore_changes = [name]
    create_before_destroy = false
  }
  
  depends_on = [
    google_project_service.required_apis["storage.googleapis.com"]
  ]
}

# Then make the bucket accessible to Firebase
resource "google_firebase_storage_bucket" "default" {
  provider = google-beta
  project  = var.project_id
  bucket_id = google_storage_bucket.firebase_bucket.name

  lifecycle {
    create_before_destroy = false
  }

  depends_on = [
    google_firebase_project.default,
    google_storage_bucket.firebase_bucket,
    google_project_service.required_apis["firebasestorage.googleapis.com"]
  ]
}

# Service Accounts
resource "google_service_account" "device_auth" {
  project      = var.project_id
  account_id   = "${var.solution_prefix}-device-auth-sa"
  display_name = "Device Authenticator Service Account"
  description  = "Service account for device authentication Cloud Function"

  lifecycle {
    ignore_changes = [display_name, description]
  }
}

resource "google_service_account" "tvm" {
  project      = var.project_id
  account_id   = "${var.solution_prefix}-tvm-sa"
  display_name = "Token Vending Machine Service Account"
  description  = "Service account for token vending machine Cloud Function"
}

resource "google_service_account" "vertex_ai" {
  project      = var.project_id
  account_id   = "${var.solution_prefix}-vertex-ai-sa"
  display_name = "Vertex AI Service Account"
  description  = "Service account for Vertex AI operations"
}

resource "google_service_account" "api_gateway" {
  project      = var.project_id
  account_id   = "${var.solution_prefix}-apigw-invoker-sa"
  display_name = "API Gateway Invoker Service Account"
  description  = "Service account for API Gateway to invoke Cloud Functions"
}

# IAM permissions for service accounts
resource "google_project_iam_member" "device_auth_permissions" {
  for_each = toset([
    "roles/iam.serviceAccountTokenCreator",
    "roles/firebase.admin",
    "roles/logging.logWriter"
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.device_auth.email}"
}

resource "google_project_iam_member" "tvm_permissions" {
  for_each = toset([
    "roles/iam.serviceAccountTokenCreator",
    "roles/logging.logWriter"
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.tvm.email}"
}

resource "google_project_iam_member" "vertex_ai_permissions" {
  for_each = toset([
    "roles/aiplatform.user",
    "roles/datastore.user",
    "roles/storage.objectViewer"
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.vertex_ai.email}"
}

resource "google_project_iam_member" "api_gateway_permissions" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.api_gateway.email}"
}

# Workload Identity Pool
resource "google_iam_workload_identity_pool" "anava_pool" {
  project                   = var.project_id
  workload_identity_pool_id = "${var.solution_prefix}-wif-pool"
  display_name              = "${var.solution_prefix} Workload Identity Pool"
  description               = "Identity pool for ${var.solution_prefix} Firebase auth federation"
}

# Workload Identity Provider for Firebase
resource "google_iam_workload_identity_pool_provider" "firebase_provider" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.anava_pool.workload_identity_pool_id
  workload_identity_pool_provider_id = "${var.solution_prefix}-firebase-provider"
  display_name                       = "${var.solution_prefix} Firebase Provider"

  attribute_mapping = {
    "google.subject"                  = "assertion.sub"
    "attribute.firebase_project_id"   = "assertion.aud"
    "attribute.firebase_tenant"       = "assertion.firebase.tenant"
    "attribute.firebase_sign_in_provider" = "assertion.firebase.sign_in_provider"
  }

  attribute_condition = "assertion.aud == \"${var.project_id}\""

  oidc {
    issuer_uri = "https://securetoken.google.com/${var.project_id}"
  }
}

# Allow WIF principal to impersonate Vertex AI service account
resource "google_service_account_iam_binding" "wif_vertex_binding" {
  service_account_id = google_service_account.vertex_ai.name
  role               = "roles/iam.workloadIdentityUser"

  members = [
    "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.anava_pool.name}/*"
  ]
}

# Cloud Storage bucket for function source
resource "google_storage_bucket" "function_source" {
  project  = var.project_id
  name     = "${var.project_id}-${var.solution_prefix}-function-source"
  location = var.region

  uniform_bucket_level_access = true
  force_destroy              = true

  depends_on = [google_project_service.required_apis]
}

# Archive for device-auth function
data "archive_file" "device_auth_source" {
  type        = "zip"
  output_path = "${path.module}/.terraform/tmp/device-auth-source.zip"

  source {
    content  = file("${path.module}/functions/device-auth/main.py")
    filename = "main.py"
  }

  source {
    content  = file("${path.module}/functions/device-auth/requirements.txt")
    filename = "requirements.txt"
  }
}

# Upload device-auth function source
resource "google_storage_bucket_object" "device_auth_source" {
  name   = "device-auth-source-${data.archive_file.device_auth_source.output_md5}.zip"
  bucket = google_storage_bucket.function_source.name
  source = data.archive_file.device_auth_source.output_path
}

# Archive for token-vending-machine function
data "archive_file" "tvm_source" {
  type        = "zip"
  output_path = "${path.module}/.terraform/tmp/tvm-source.zip"

  source {
    content  = file("${path.module}/functions/token-vending-machine/main.py")
    filename = "main.py"
  }

  source {
    content  = file("${path.module}/functions/token-vending-machine/requirements.txt")
    filename = "requirements.txt"
  }
}

# Upload token-vending-machine function source
resource "google_storage_bucket_object" "tvm_source" {
  name   = "tvm-source-${data.archive_file.tvm_source.output_md5}.zip"
  bucket = google_storage_bucket.function_source.name
  source = data.archive_file.tvm_source.output_path
}

# Device Auth Cloud Function
resource "google_cloudfunctions2_function" "device_auth" {
  project  = var.project_id
  name     = "${var.solution_prefix}-device-auth-fn"
  location = var.region

  build_config {
    runtime     = "python311"
    entry_point = "device_authenticator"
    source {
      storage_source {
        bucket = google_storage_bucket.function_source.name
        object = google_storage_bucket_object.device_auth_source.name
      }
    }
  }

  service_config {
    max_instance_count    = 5
    available_memory      = "256M"
    timeout_seconds       = 60
    service_account_email = google_service_account.device_auth.email
  }

  depends_on = [
    google_project_service.required_apis,
    google_project_iam_member.device_auth_permissions
  ]
}

# Token Vending Machine Cloud Function
resource "google_cloudfunctions2_function" "tvm" {
  project  = var.project_id
  name     = "${var.solution_prefix}-tvm-fn"
  location = var.region

  build_config {
    runtime     = "python311"
    entry_point = "token_vendor_machine"
    source {
      storage_source {
        bucket = google_storage_bucket.function_source.name
        object = google_storage_bucket_object.tvm_source.name
      }
    }
  }

  service_config {
    max_instance_count    = 5
    available_memory      = "256M"
    timeout_seconds       = 60
    service_account_email = google_service_account.tvm.email

    environment_variables = {
      WIF_PROJECT_NUMBER           = data.google_project.project.number
      WIF_POOL_ID                 = google_iam_workload_identity_pool.anava_pool.workload_identity_pool_id
      WIF_PROVIDER_ID             = google_iam_workload_identity_pool_provider.firebase_provider.workload_identity_pool_provider_id
      TARGET_SERVICE_ACCOUNT_EMAIL = google_service_account.vertex_ai.email
    }
  }

  depends_on = [
    google_project_service.required_apis,
    google_project_iam_member.tvm_permissions
  ]
}

# Grant API Gateway permission to invoke functions
resource "google_cloudfunctions2_function_iam_member" "device_auth_invoker" {
  project        = var.project_id
  location       = var.region
  cloud_function = google_cloudfunctions2_function.device_auth.name
  role           = "roles/cloudfunctions.invoker"
  member         = "serviceAccount:${google_service_account.api_gateway.email}"
}

resource "google_cloudfunctions2_function_iam_member" "tvm_invoker" {
  project        = var.project_id
  location       = var.region
  cloud_function = google_cloudfunctions2_function.tvm.name
  role           = "roles/cloudfunctions.invoker"
  member         = "serviceAccount:${google_service_account.api_gateway.email}"
}

# Random suffix for API Gateway
resource "random_id" "api_suffix" {
  byte_length = 4
}

# API Gateway API
resource "google_api_gateway_api" "anava_api" {
  provider = google-beta
  project  = var.project_id
  api_id   = "${var.solution_prefix}-api"
  
  depends_on = [google_project_service.required_apis]
}

# OpenAPI specification for API Gateway
locals {
  openapi_spec = templatefile("${path.module}/templates/openapi.yaml.tpl", {
    solution_prefix       = var.solution_prefix
    api_managed_service   = "${google_api_gateway_api.anava_api.api_id}-${random_id.api_suffix.hex}.apigateway.${var.project_id}.cloud.goog"
    device_auth_url      = google_cloudfunctions2_function.device_auth.service_config[0].uri
    tvm_url              = google_cloudfunctions2_function.tvm.service_config[0].uri
  })
}

# API Gateway Configuration
resource "google_api_gateway_api_config" "anava_config" {
  provider      = google-beta
  project       = var.project_id
  api           = google_api_gateway_api.anava_api.api_id
  api_config_id = "${var.solution_prefix}-config-${random_id.api_suffix.hex}"
  
  openapi_documents {
    document {
      path     = "openapi.yaml"
      contents = base64encode(local.openapi_spec)
    }
  }
  
  gateway_config {
    backend_config {
      google_service_account = google_service_account.api_gateway.email
    }
  }
  
  depends_on = [
    google_api_gateway_api.anava_api,
    google_cloudfunctions2_function.device_auth,
    google_cloudfunctions2_function.tvm
  ]
}

# API Gateway
resource "google_api_gateway_gateway" "anava_gateway" {
  provider   = google-beta
  project    = var.project_id
  gateway_id = "${var.solution_prefix}-gateway"
  api_config = google_api_gateway_api_config.anava_config.id
  region     = var.region
  
  depends_on = [google_api_gateway_api_config.anava_config]
}


# API Key for API Gateway
resource "google_apikeys_key" "api_gateway_key" {
  project      = var.project_id
  name         = "${var.solution_prefix}-api-key"
  display_name = "${var.solution_prefix} API Gateway Key"

  restrictions {
    api_targets {
      service = google_api_gateway_api.anava_api.managed_service
    }
  }

  depends_on = [google_api_gateway_gateway.anava_gateway]
}

# Firebase Web App
resource "google_firebase_web_app" "default" {
  provider     = google-beta
  project      = var.project_id
  display_name = var.firebase_web_app_name

  lifecycle {
    ignore_changes = [app_id]
  }

  depends_on = [google_firebase_project.default]
}

# Firebase API Key (retrieved from Web App)
data "google_firebase_web_app_config" "default" {
  provider   = google-beta
  project    = var.project_id
  web_app_id = google_firebase_web_app.default.app_id
}

# Secret Manager secrets
resource "google_secret_manager_secret" "firebase_config" {
  project   = var.project_id
  secret_id = "${var.solution_prefix}-firebase-config"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_version" "firebase_config" {
  secret = google_secret_manager_secret.firebase_config.id

  secret_data = jsonencode({
    projectId        = var.project_id
    apiKey          = data.google_firebase_web_app_config.default.api_key
    authDomain      = data.google_firebase_web_app_config.default.auth_domain
    storageBucket   = google_firebase_storage_bucket.default.name
    databaseURL     = "https://${var.project_id}.firebaseio.com"
    appId           = google_firebase_web_app.default.app_id
  })
}

resource "google_secret_manager_secret" "api_key" {
  project   = var.project_id
  secret_id = "${var.solution_prefix}-api-key"

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  depends_on = [google_project_service.required_apis]
}

resource "google_secret_manager_secret_version" "api_key" {
  secret      = google_secret_manager_secret.api_key.id
  secret_data = google_apikeys_key.api_gateway_key.key_string
}

# Firestore security rules
resource "google_firebaserules_ruleset" "firestore" {
  provider = google-beta
  project  = var.project_id

  source {
    files {
      name    = "firestore.rules"
      content = file("${path.module}/rules/firestore.rules")
    }
  }

  depends_on = [
    google_firebase_project.default
  ]
}

# COMMENTED OUT - Firebase releases cause "already exists" errors
# These are created automatically when Firebase is initialized
# and Terraform can't handle the existing releases properly
#
# resource "google_firebaserules_release" "firestore" {
#   provider     = google-beta
#   project      = var.project_id
#   name         = "cloud.firestore/databases/(default)"
#   ruleset_name = google_firebaserules_ruleset.firestore.name
# }

# Firebase Storage security rules
resource "google_firebaserules_ruleset" "storage" {
  provider = google-beta
  project  = var.project_id

  source {
    files {
      name    = "storage.rules"
      content = file("${path.module}/rules/storage.rules")
    }
  }

  depends_on = [
    google_firebase_storage_bucket.default,
    google_firebase_project.default
  ]
}

# COMMENTED OUT - Firebase releases cause "already exists" errors
# These are created automatically when Firebase is initialized
# and Terraform can't handle the existing releases properly
#
# resource "google_firebaserules_release" "storage" {
#   provider     = google-beta
#   project      = var.project_id
#   name         = "firebase.storage/${google_firebase_storage_bucket.default.bucket_id}"
#   ruleset_name = google_firebaserules_ruleset.storage.name
# }