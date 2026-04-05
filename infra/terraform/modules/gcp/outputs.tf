output "lb_ip_address" {
  description = "Global IP address of the Cloud Load Balancer"
  value       = google_compute_global_address.lb.address
}

output "lb_name" {
  description = "Name of the Cloud Load Balancer forwarding rule"
  value       = google_compute_global_forwarding_rule.https.name
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL instance connection name (project:region:instance)"
  value       = google_sql_database_instance.postgresql.connection_name
}

output "cloud_sql_private_ip" {
  description = "Private IP address of the Cloud SQL instance"
  value       = google_sql_database_instance.postgresql.private_ip_address
}

output "redis_host" {
  description = "Memorystore Redis host"
  value       = google_redis_instance.main.host
}

output "redis_port" {
  description = "Memorystore Redis port"
  value       = google_redis_instance.main.port
}

output "artifact_registry_urls" {
  description = "Artifact Registry repository URLs for API and web"
  value = {
    api = "${var.region}-docker.pkg.dev/${data.google_project.current.project_id}/${google_artifact_registry_repository.api.repository_id}"
    web = "${var.region}-docker.pkg.dev/${data.google_project.current.project_id}/${google_artifact_registry_repository.web.repository_id}"
  }
}

output "gcs_bucket_name" {
  description = "GCS bucket name for uploads"
  value       = google_storage_bucket.uploads.name
}

output "cloud_run_api_url" {
  description = "Cloud Run API service URL"
  value       = google_cloud_run_v2_service.api.uri
}

output "cloud_run_web_url" {
  description = "Cloud Run web service URL"
  value       = google_cloud_run_v2_service.web.uri
}

output "vpc_id" {
  description = "VPC network ID"
  value       = google_compute_network.main.id
}
