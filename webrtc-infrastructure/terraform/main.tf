terraform {
  required_version = ">= 1.0"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# Project and region configuration
variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "zones" {
  description = "GCP Zones for deployment"
  type        = list(string)
  default     = ["us-central1-a", "us-central1-b", "us-central1-c"]
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
  default     = "prod"
}

variable "domain" {
  description = "Domain for TURN server"
  type        = string
  default     = "turn.example.com"
}

# Generate secure random secret for TURN
resource "random_password" "turn_secret" {
  length  = 32
  special = true
}

# Generate secure random password for database
resource "random_password" "db_password" {
  length  = 32
  special = true
}

# Create VPC for coturn infrastructure
resource "google_compute_network" "coturn_network" {
  name                    = "coturn-network-${var.environment}"
  auto_create_subnetworks = false
  project                 = var.project_id
}

# Create subnet
resource "google_compute_subnetwork" "coturn_subnet" {
  name          = "coturn-subnet-${var.environment}"
  ip_cidr_range = "10.0.0.0/24"
  region        = var.region
  network       = google_compute_network.coturn_network.id
  project       = var.project_id

  private_ip_google_access = true
}

# Cloud SQL instance for persistent storage
resource "google_sql_database_instance" "coturn_db" {
  name             = "coturn-db-${var.environment}"
  database_version = "POSTGRES_15"
  region           = var.region
  project          = var.project_id

  settings {
    tier = "db-g1-small"
    
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.coturn_network.id
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      location                       = var.region
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
    }

    database_flags {
      name  = "max_connections"
      value = "1000"
    }
  }

  deletion_protection = true
}

# Database for coturn
resource "google_sql_database" "coturn" {
  name     = "coturn"
  instance = google_sql_database_instance.coturn_db.name
  project  = var.project_id
}

# Database user
resource "google_sql_user" "coturn" {
  name     = "coturn"
  instance = google_sql_database_instance.coturn_db.name
  password = random_password.db_password.result
  project  = var.project_id
}

# Redis instance for distributed state
resource "google_redis_instance" "coturn_cache" {
  name           = "coturn-cache-${var.environment}"
  tier           = "STANDARD_HA"
  memory_size_gb = 1
  region         = var.region
  project        = var.project_id

  authorized_network = google_compute_network.coturn_network.id
  redis_version      = "REDIS_7_0"

  redis_configs = {
    maxmemory-policy = "allkeys-lru"
  }
}

# Service account for coturn instances
resource "google_service_account" "coturn" {
  account_id   = "coturn-${var.environment}"
  display_name = "Coturn Service Account"
  project      = var.project_id
}

# IAM roles for service account
resource "google_project_iam_member" "coturn_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.coturn.email}"
}

resource "google_project_iam_member" "coturn_metric_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.coturn.email}"
}

# Container image repository
resource "google_artifact_registry_repository" "coturn" {
  location      = var.region
  repository_id = "coturn-${var.environment}"
  description   = "Docker repository for coturn images"
  format        = "DOCKER"
  project       = var.project_id
}

# Health check for coturn instances
resource "google_compute_health_check" "coturn" {
  name                = "coturn-health-check-${var.environment}"
  check_interval_sec  = 10
  timeout_sec         = 5
  healthy_threshold   = 2
  unhealthy_threshold = 3
  project             = var.project_id

  tcp_health_check {
    port = 3478
  }
}

# Instance template for coturn VMs
resource "google_compute_instance_template" "coturn" {
  name_prefix  = "coturn-${var.environment}-"
  machine_type = "n2-standard-4"
  region       = var.region
  project      = var.project_id

  disk {
    source_image = "cos-cloud/cos-stable"
    auto_delete  = true
    boot         = true
    disk_size_gb = 50
    disk_type    = "pd-ssd"
  }

  network_interface {
    network    = google_compute_network.coturn_network.id
    subnetwork = google_compute_subnetwork.coturn_subnet.id
    
    access_config {
      # External IP for TURN
    }
  }

  service_account {
    email  = google_service_account.coturn.email
    scopes = ["cloud-platform"]
  }

  metadata = {
    google-logging-enabled = "true"
    
    # Container declaration for COS
    gce-container-declaration = jsonencode({
      spec = {
        containers = [{
          name  = "coturn"
          image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.coturn.repository_id}/coturn:latest"
          
          env = [
            {
              name  = "TURN_SECRET"
              value = random_password.turn_secret.result
            },
            {
              name  = "REALM"
              value = var.domain
            },
            {
              name  = "REDIS_HOST"
              value = google_redis_instance.coturn_cache.host
            },
            {
              name  = "REDIS_PORT"
              value = tostring(google_redis_instance.coturn_cache.port)
            },
            {
              name  = "POSTGRES_HOST"
              value = google_sql_database_instance.coturn_db.private_ip_address
            },
            {
              name  = "POSTGRES_USER"
              value = google_sql_user.coturn.name
            },
            {
              name  = "POSTGRES_PASSWORD"
              value = google_sql_user.coturn.password
            },
            {
              name  = "POSTGRES_DB"
              value = google_sql_database.coturn.name
            }
          ]
          
          # Resource limits
          resources = {
            limits = {
              cpu    = "4"
              memory = "8Gi"
            }
          }
        }]
      }
    })
  }

  tags = ["coturn-server"]

  lifecycle {
    create_before_destroy = true
  }
}

# Managed instance group
resource "google_compute_region_instance_group_manager" "coturn" {
  name               = "coturn-mig-${var.environment}"
  base_instance_name = "coturn"
  region             = var.region
  project            = var.project_id

  version {
    instance_template = google_compute_instance_template.coturn.id
  }

  target_size = 3

  named_port {
    name = "stun"
    port = 3478
  }

  named_port {
    name = "turns"
    port = 5349
  }

  auto_healing_policies {
    health_check      = google_compute_health_check.coturn.id
    initial_delay_sec = 300
  }

  update_policy {
    type                           = "PROACTIVE"
    minimal_action                 = "REPLACE"
    instance_redistribution_type   = "PROACTIVE"
    max_surge_fixed               = 1
    max_unavailable_fixed         = 0
    replacement_method            = "SUBSTITUTE"
  }
}

# Firewall rules
resource "google_compute_firewall" "coturn_ingress" {
  name    = "coturn-ingress-${var.environment}"
  network = google_compute_network.coturn_network.name
  project = var.project_id

  allow {
    protocol = "tcp"
    ports    = ["3478", "5349", "8080", "8443"]
  }

  allow {
    protocol = "udp"
    ports    = ["3478", "5349", "8080", "8443", "49152-65535"]
  }

  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["coturn-server"]
}

resource "google_compute_firewall" "coturn_health_check" {
  name    = "coturn-health-check-${var.environment}"
  network = google_compute_network.coturn_network.name
  project = var.project_id

  allow {
    protocol = "tcp"
    ports    = ["3478"]
  }

  source_ranges = ["35.191.0.0/16", "130.211.0.0/22"]
  target_tags   = ["coturn-server"]
}

# Global load balancer
resource "google_compute_global_address" "coturn_ip" {
  name    = "coturn-ip-${var.environment}"
  project = var.project_id
}

# Outputs
output "turn_server_ip" {
  value = google_compute_global_address.coturn_ip.address
}

output "turn_secret" {
  value     = random_password.turn_secret.result
  sensitive = true
}

output "turn_urls" {
  value = [
    "stun:${google_compute_global_address.coturn_ip.address}:3478",
    "turn:${google_compute_global_address.coturn_ip.address}:3478",
    "turns:${google_compute_global_address.coturn_ip.address}:5349"
  ]
}

output "webrtc_config" {
  value = jsonencode({
    iceServers = [
      {
        urls = [
          "stun:${google_compute_global_address.coturn_ip.address}:3478"
        ]
      },
      {
        urls = [
          "turn:${google_compute_global_address.coturn_ip.address}:3478",
          "turns:${google_compute_global_address.coturn_ip.address}:5349"
        ]
        username   = "webrtc"
        credential = random_password.turn_secret.result
      }
    ]
  })
  sensitive = true
}