variable "project_id" {
  description = "The GCP project ID"
  type        = string
}

variable "region" {
  description = "The GCP region for resources"
  type        = string
  default     = "us-central1"
}

variable "solution_prefix" {
  description = "Prefix for all resource names"
  type        = string
  default     = "anava"
}

variable "firestore_database_id" {
  description = "ID for the Firestore database"
  type        = string
  default     = "anava"
}

variable "firestore_location" {
  description = "Location for Firestore database (e.g., nam5, eur3, us-central1)"
  type        = string
  default     = "nam5"
}

variable "firebase_web_app_name" {
  description = "Display name for the Firebase Web App"
  type        = string
  default     = "Anava Device Manager"
}

variable "allowed_origins" {
  description = "List of allowed origins for CORS configuration"
  type        = list(string)
  default     = ["http://localhost:3000", "http://localhost:3001"]
}

variable "storage_location" {
  description = "Location for Cloud Storage buckets"
  type        = string
  default     = "US"
}