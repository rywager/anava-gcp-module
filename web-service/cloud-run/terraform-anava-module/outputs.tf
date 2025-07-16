output "api_gateway_url" {
  description = "The URL of the deployed API Gateway"
  value       = "https://${data.google_api_gateway_gateway.anava_gateway_data.default_hostname}"
}

output "api_key" {
  description = "The API key for accessing the API Gateway"
  value       = google_apikeys_key.api_gateway_key.key_string
  sensitive   = true
}

output "firebase_config_secret_name" {
  description = "Secret Manager secret containing Firebase configuration"
  value       = google_secret_manager_secret.firebase_config.name
}

output "firebase_api_key_secret_name" {
  description = "Secret Manager secret containing API key"
  value       = google_secret_manager_secret.api_key.name
}

output "workload_identity_provider" {
  description = "Workload Identity Federation provider for Firebase auth"
  value       = google_iam_workload_identity_pool_provider.firebase_provider.name
}

output "vertex_ai_service_account_email" {
  description = "Email of the Vertex AI service account"
  value       = google_service_account.vertex_ai.email
}

output "device_auth_function_url" {
  description = "URL of the device authentication Cloud Function"
  value       = google_cloudfunctions2_function.device_auth.service_config[0].uri
}

output "tvm_function_url" {
  description = "URL of the token vending machine Cloud Function"
  value       = google_cloudfunctions2_function.tvm.service_config[0].uri
}

output "firebase_storage_bucket" {
  description = "Firebase Storage bucket name"
  value       = google_firebase_storage_bucket.default.name
}


output "firebase_web_app_id" {
  description = "Firebase Web App ID"
  value       = google_firebase_web_app.default.app_id
}

output "firebase_config" {
  description = "Firebase configuration for client applications"
  value = {
    projectId      = var.project_id
    apiKey         = data.google_firebase_web_app_config.default.api_key
    authDomain     = data.google_firebase_web_app_config.default.auth_domain
    storageBucket  = google_firebase_storage_bucket.default.name
    databaseURL    = "https://${var.project_id}.firebaseio.com"
    appId          = google_firebase_web_app.default.app_id
  }
  sensitive = true
}