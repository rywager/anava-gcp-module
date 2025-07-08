# Anava GCP Module - Input Variables

variable "project_id" {
  description = "The GCP project ID where resources will be created"
  type        = string

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "Project ID must be 6-30 characters, start with a letter, and contain only lowercase letters, numbers, and hyphens."
  }
}

variable "region" {
  description = "The GCP region where resources will be created"
  type        = string
  default     = "us-central1"

  validation {
    condition = contains([
      "us-central1", "us-east1", "us-west1", "us-west2", "us-west3", "us-west4",
      "europe-west1", "europe-west2", "europe-west3", "europe-west4", "europe-west6",
      "asia-east1", "asia-northeast1", "asia-southeast1", "australia-southeast1"
    ], var.region)
    error_message = "Region must be a valid GCP region."
  }
}

variable "solution_prefix" {
  description = "Prefix for all resource names to ensure uniqueness"
  type        = string
  default     = "anava"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,20}[a-z0-9]$", var.solution_prefix))
    error_message = "Solution prefix must be 3-22 characters, start with a letter, and contain only lowercase letters, numbers, and hyphens."
  }
}

variable "firebase_database_id" {
  description = "The Firestore database ID to create"
  type        = string
  default     = "anava"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,63}$", var.firebase_database_id))
    error_message = "Database ID must start with a letter and contain only lowercase letters, numbers, and hyphens."
  }
}

variable "enable_apis" {
  description = "Whether to enable required Google Cloud APIs"
  type        = bool
  default     = true
}

variable "cloud_functions_source_archive_bucket" {
  description = "GCS bucket for Cloud Functions source archives (optional, will create if not provided)"
  type        = string
  default     = ""
}

variable "firebase_web_app_origins" {
  description = "List of allowed origins for Firebase Storage CORS configuration"
  type        = list(string)
  default     = []
}

variable "labels" {
  description = "Labels to apply to all resources"
  type        = map(string)
  default = {
    solution = "anava-secure-cloud-installer"
    managed  = "terraform"
  }
}