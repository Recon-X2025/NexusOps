output "lb_ip_address" {
  description = "Global IP address of the Cloud Load Balancer"
  value       = module.gcp.lb_ip_address
}

output "lb_name" {
  description = "Name of the Cloud Load Balancer forwarding rule"
  value       = module.gcp.lb_name
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL instance connection name (project:region:instance)"
  value       = module.gcp.cloud_sql_connection_name
}

output "cloud_sql_private_ip" {
  description = "Private IP address of the Cloud SQL instance"
  value       = module.gcp.cloud_sql_private_ip
}

output "redis_host" {
  description = "Memorystore Redis host"
  value       = module.gcp.redis_host
}

output "redis_port" {
  description = "Memorystore Redis port"
  value       = module.gcp.redis_port
}

output "artifact_registry_urls" {
  description = "Artifact Registry repository URLs for API and web"
  value       = module.gcp.artifact_registry_urls
}

output "gcs_bucket_name" {
  description = "GCS bucket name for uploads"
  value       = module.gcp.gcs_bucket_name
}

output "cloud_run_api_url" {
  description = "Cloud Run API service URL"
  value       = module.gcp.cloud_run_api_url
}

output "cloud_run_web_url" {
  description = "Cloud Run web service URL"
  value       = module.gcp.cloud_run_web_url
}

output "vpc_id" {
  description = "VPC network ID"
  value       = module.gcp.vpc_id
}
