terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  region = var.region
}

locals {
  name    = "${var.app_name}-${var.environment}"
  project = data.google_project.current.project_id
  labels = merge({
    app         = var.app_name
    environment = var.environment
    managed_by  = "terraform"
  }, var.tags)

  # Cloud Run CPU and memory maps (mirrors ECS task_cpu_map / task_memory_map)
  cpu_map = {
    small  = "1"
    medium = "2"
    large  = "4"
  }
  memory_map = {
    small  = "512Mi"
    medium = "1Gi"
    large  = "2Gi"
  }
  run_cpu    = local.cpu_map[var.instance_type]
  run_memory = local.memory_map[var.instance_type]
}

data "google_project" "current" {}

# ── VPC ───────────────────────────────────────────────────────────────────────
resource "google_compute_network" "main" {
  name                    = "${local.name}-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "private" {
  name                     = "${local.name}-private"
  region                   = var.region
  network                  = google_compute_network.main.id
  ip_cidr_range            = "10.0.0.0/20"
  private_ip_google_access = true
}

resource "google_compute_subnetwork" "public" {
  name          = "${local.name}-public"
  region        = var.region
  network       = google_compute_network.main.id
  ip_cidr_range = "10.0.16.0/20"
}

# VPC connector bridges serverless Cloud Run to the private VPC (Cloud SQL/Redis)
resource "google_vpc_access_connector" "main" {
  name          = "${local.name}-connector"
  region        = var.region
  network       = google_compute_network.main.id
  ip_cidr_range = "10.0.32.0/28"
  min_throughput = 200
  max_throughput = 1000
}

# ── Artifact Registry ─────────────────────────────────────────────────────────
resource "google_artifact_registry_repository" "api" {
  location      = var.region
  repository_id = "${local.name}-api"
  format        = "DOCKER"
  labels        = local.labels
}

resource "google_artifact_registry_repository" "web" {
  location      = var.region
  repository_id = "${local.name}-web"
  format        = "DOCKER"
  labels        = local.labels
}

# ── IAM Service Account for Cloud Run ─────────────────────────────────────────
resource "google_service_account" "cloud_run" {
  account_id   = "${local.name}-run"
  display_name = "${local.name} Cloud Run Service Account"
}

resource "google_project_iam_member" "cloud_run_sql_client" {
  project = local.project
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_storage_object_admin" {
  project = local.project
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_secret_accessor" {
  project = local.project
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

resource "google_project_iam_member" "cloud_run_artifact_reader" {
  project = local.project
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.cloud_run.email}"
}

# ── Secret Manager — DATABASE_URL ─────────────────────────────────────────────
resource "google_secret_manager_secret" "database_url" {
  secret_id = "${local.name}-database-url"
  labels    = local.labels

  replication {
    auto {}
  }
}

# ── Cloud SQL PostgreSQL 15 ───────────────────────────────────────────────────
resource "google_compute_global_address" "sql_private_ip" {
  name          = "${local.name}-sql-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "sql_private" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.sql_private_ip.name]
}

resource "google_sql_database_instance" "postgresql" {
  name             = "${local.name}-pg"
  database_version = "POSTGRES_15"
  region           = var.region

  settings {
    tier = var.db_tier

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = var.backup_retention_days
      backup_retention_settings {
        retained_backups = var.backup_retention_days
      }
    }

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.main.id
      enable_private_path_for_google_cloud_services = true
    }

    maintenance_window {
      day  = 7 # Sunday
      hour = 4
    }

    user_labels = local.labels
  }

  deletion_protection = true
  depends_on          = [google_service_networking_connection.sql_private]

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_sql_database" "main" {
  name     = var.db_name
  instance = google_sql_database_instance.postgresql.name
}

resource "google_sql_user" "main" {
  name     = var.db_username
  instance = google_sql_database_instance.postgresql.name
  password = var.db_password
}

# ── Memorystore Redis ─────────────────────────────────────────────────────────
resource "google_redis_instance" "main" {
  name           = "${local.name}-redis"
  tier           = "BASIC"
  memory_size_gb = 1
  region         = var.region

  authorized_network = google_compute_network.main.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"

  redis_version    = "REDIS_7_0"
  display_name     = "${local.name} Redis"
  redis_configs    = {}
  reserved_ip_range = "10.0.48.0/29"

  labels     = local.labels
  depends_on = [google_service_networking_connection.sql_private]
}

# ── GCS Bucket for uploads ────────────────────────────────────────────────────
resource "google_storage_bucket" "uploads" {
  name          = "${local.name}-uploads-${local.project}"
  location      = var.region
  force_destroy = false
  labels        = local.labels

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  encryption {
    default_kms_key_name = null
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_storage_bucket_iam_member" "uploads_run" {
  bucket = google_storage_bucket.uploads.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.cloud_run.email}"
}

# ── Cloud Run — API ───────────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "api" {
  name     = "${local.name}-api"
  location = var.region
  labels   = local.labels

  template {
    service_account = google_service_account.cloud_run.email

    scaling {
      min_instance_count = var.desired_count_api
      max_instance_count = var.desired_count_api * 4
    }

    vpc_access {
      connector = google_vpc_access_connector.main.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.api_image

      resources {
        limits = {
          cpu    = local.run_cpu
          memory = local.run_memory
        }
      }

      ports {
        container_port = 3001
      }

      env {
        name  = "NODE_ENV"
        value = var.environment
      }
      env {
        name  = "PORT"
        value = "3001"
      }
      env {
        name  = "INSTANCE_CONNECTION_NAME"
        value = google_sql_database_instance.postgresql.connection_name
      }
    }
  }

  depends_on = [
    google_vpc_access_connector.main,
    google_sql_database_instance.postgresql,
  ]
}

# ── Cloud Run — Web ───────────────────────────────────────────────────────────
resource "google_cloud_run_v2_service" "web" {
  name     = "${local.name}-web"
  location = var.region
  labels   = local.labels

  template {
    service_account = google_service_account.cloud_run.email

    scaling {
      min_instance_count = var.desired_count_web
      max_instance_count = var.desired_count_web * 4
    }

    vpc_access {
      connector = google_vpc_access_connector.main.id
      egress    = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = var.web_image

      resources {
        limits = {
          cpu    = local.run_cpu
          memory = local.run_memory
        }
      }

      ports {
        container_port = 3000
      }

      env {
        name  = "NODE_ENV"
        value = var.environment
      }
      env {
        name  = "PORT"
        value = "3000"
      }
    }
  }

  depends_on = [google_vpc_access_connector.main]
}

# Allow unauthenticated public invocations for both services
resource "google_cloud_run_v2_service_iam_member" "api_public" {
  project  = local.project
  location = var.region
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "web_public" {
  project  = local.project
  location = var.region
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# ── Cloud Load Balancing (HTTP(S) with managed SSL) ───────────────────────────
resource "google_compute_global_address" "lb" {
  name = "${local.name}-lb-ip"
}

resource "google_compute_managed_ssl_certificate" "main" {
  name = "${local.name}-ssl-cert"

  managed {
    domains = [var.domain_name, "api.${var.domain_name}"]
  }
}

# NEG — API Cloud Run
resource "google_compute_region_network_endpoint_group" "api" {
  name                  = "${local.name}-api-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.api.name
  }
}

# NEG — Web Cloud Run
resource "google_compute_region_network_endpoint_group" "web" {
  name                  = "${local.name}-web-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.web.name
  }
}

resource "google_compute_backend_service" "api" {
  name                  = "${local.name}-api-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTP"

  backend {
    group = google_compute_region_network_endpoint_group.api.id
  }
}

resource "google_compute_backend_service" "web" {
  name                  = "${local.name}-web-backend"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTP"

  backend {
    group = google_compute_region_network_endpoint_group.web.id
  }
}

resource "google_compute_url_map" "main" {
  name            = "${local.name}-url-map"
  default_service = google_compute_backend_service.web.id

  host_rule {
    hosts        = ["api.${var.domain_name}"]
    path_matcher = "api-paths"
  }

  path_matcher {
    name            = "api-paths"
    default_service = google_compute_backend_service.api.id
  }
}

resource "google_compute_url_map" "http_redirect" {
  name = "${local.name}-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_https_proxy" "main" {
  name             = "${local.name}-https-proxy"
  url_map          = google_compute_url_map.main.id
  ssl_certificates = [google_compute_managed_ssl_certificate.main.id]
}

resource "google_compute_target_http_proxy" "redirect" {
  name    = "${local.name}-http-proxy"
  url_map = google_compute_url_map.http_redirect.id
}

resource "google_compute_global_forwarding_rule" "https" {
  name                  = "${local.name}-https-fwd"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.lb.address
  port_range            = "443"
  target                = google_compute_target_https_proxy.main.id
  labels                = local.labels
}

resource "google_compute_global_forwarding_rule" "http" {
  name                  = "${local.name}-http-fwd"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_address            = google_compute_global_address.lb.address
  port_range            = "80"
  target                = google_compute_target_http_proxy.redirect.id
  labels                = local.labels
}
