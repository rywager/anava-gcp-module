/**
 * Anava GCP Terraform Module
 * 
 * Deploys secure cloud infrastructure including:
 * - Firebase project setup
 * - Cloud Functions API backend
 * - API Gateway with authentication
 * - Service accounts with Workload Identity
 * - Secret Manager for configuration
 */

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.1"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.1"
    }
  }
}

# Enable required APIs
resource "google_project_service" "required_apis" {
  for_each = toset([
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "firebase.googleapis.com",
    "cloudfunctions.googleapis.com",
    "apigateway.googleapis.com",
    "secretmanager.googleapis.com",
    "firestore.googleapis.com",
    "compute.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com"
  ])

  project = var.project_id
  service = each.value

  disable_dependent_services = false
  disable_on_destroy        = false
}

# Firebase project
resource "google_firebase_project" "default" {
  provider = google
  project  = var.project_id

  depends_on = [google_project_service.required_apis]
}

# Firestore database
resource "google_firestore_database" "default" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  depends_on = [google_firebase_project.default]
}

# Service account for Anava functions
resource "google_service_account" "anava_sa" {
  project      = var.project_id
  account_id   = "${var.solution_prefix}-sa"
  display_name = "Anava Service Account"
  description  = "Service account for Anava cloud functions and services"
}

# Grant necessary permissions to the service account
resource "google_project_iam_member" "anava_sa_permissions" {
  for_each = toset([
    "roles/firestore.user",
    "roles/secretmanager.secretAccessor",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter"
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.anava_sa.email}"
}

# Workload Identity Pool
resource "google_iam_workload_identity_pool" "anava_pool" {
  project                   = var.project_id
  workload_identity_pool_id = "${var.solution_prefix}-pool"
  display_name              = "Anava Workload Identity Pool"
  description               = "Identity pool for Anava external workloads"
}

# Workload Identity Provider
resource "google_iam_workload_identity_pool_provider" "anava_provider" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.anava_pool.workload_identity_pool_id
  workload_identity_pool_provider_id = "${var.solution_prefix}-provider"
  display_name                       = "Anava OIDC Provider"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  oidc {
    issuer_uri        = "https://token.actions.githubusercontent.com"
    allowed_audiences = ["sts.googleapis.com"]
  }
}

# Allow external identity to impersonate service account
resource "google_service_account_iam_binding" "workload_identity_binding" {
  service_account_id = google_service_account.anava_sa.name
  role               = "roles/iam.workloadIdentityUser"

  members = [
    "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.anava_pool.name}/attribute.repository/anava-ai/*"
  ]
}

# Secret for Firebase configuration
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

# Secret for API key
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

# Random suffix for unique resource naming
resource "random_id" "gateway_suffix" {
  byte_length = 4
}

# API Gateway API
resource "google_api_gateway_api" "anava_api" {
  provider = google
  project  = var.project_id
  api_id   = "${var.solution_prefix}-api"
  
  depends_on = [google_project_service.required_apis]
}

# Simple OpenAPI spec for basic API Gateway
resource "local_file" "openapi_spec" {
  filename = "${path.module}/openapi.yaml"
  content = <<EOF
swagger: '2.0'
info:
  title: Anava API
  description: Anava Secure Cloud Infrastructure API
  version: 1.0.0
host: ${google_api_gateway_api.anava_api.api_id}-${random_id.gateway_suffix.hex}.apigateway.${var.region}.run.app
schemes:
  - https
paths:
  /health:
    get:
      summary: Health check
      responses:
        200:
          description: Service is healthy
          schema:
            type: object
            properties:
              status:
                type: string
                example: healthy
EOF
}

# API Gateway API Config
resource "google_api_gateway_api_config" "anava_config" {
  provider      = google
  project       = var.project_id
  api           = google_api_gateway_api.anava_api.api_id
  api_config_id = "${var.solution_prefix}-config"
  
  openapi_documents {
    document {
      path     = "openapi.yaml"
      contents = base64encode(local_file.openapi_spec.content)
    }
  }
  
  depends_on = [google_api_gateway_api.anava_api]
}

# API Gateway
resource "google_api_gateway_gateway" "anava_gateway" {
  provider   = google
  project    = var.project_id
  gateway_id = "${var.solution_prefix}-gateway"
  api_config = google_api_gateway_api_config.anava_config.id
  region     = var.region
  
  depends_on = [google_api_gateway_api_config.anava_config]
}