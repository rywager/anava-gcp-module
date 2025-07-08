# Anava GCP Module - Outputs

# API Gateway URL
output "api_gateway_url" {
  description = "The URL of the deployed API Gateway"
  value       = "https://${google_api_gateway_gateway.anava_gateway.default_hostname}"
}

# Secret Manager secret names (not the actual secrets)
output "firebase_api_key_secret_name" {
  description = "The name of the Secret Manager secret containing the Firebase API key"
  value       = google_secret_manager_secret.api_key.secret_id
}

output "firebase_config_secret_name" {
  description = "The name of the Secret Manager secret containing the Firebase configuration"
  value       = google_secret_manager_secret.firebase_config.secret_id
}

# Service Account email
output "service_account_email" {
  description = "The email of the Anava service account"
  value       = google_service_account.anava_sa.email
}

# Workload Identity Federation
output "workload_identity_provider" {
  description = "The full name of the Workload Identity Federation provider"
  value       = google_iam_workload_identity_pool_provider.anava_provider.name
}

output "workload_identity_pool_id" {
  description = "The ID of the Workload Identity Federation pool"
  value       = google_iam_workload_identity_pool.anava_pool.workload_identity_pool_id
}

# Project information
output "project_id" {
  description = "The project ID"
  value       = var.project_id
}

# Configuration values
output "solution_prefix" {
  description = "The solution prefix used for resource naming"
  value       = var.solution_prefix
}

output "region" {
  description = "The GCP region where resources are deployed"
  value       = var.region
}