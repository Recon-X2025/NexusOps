variable "region" {
  description = "GCP region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Deployment environment (staging, production)"
  type        = string
}

variable "app_name" {
  description = "Application name"
  type        = string
  default     = "nexusops"
}

variable "instance_type" {
  description = "Cloud Run CPU/memory size (small, medium, large)"
  type        = string
  default     = "medium"
}

variable "db_tier" {
  description = "Cloud SQL instance tier"
  type        = string
  default     = "db-g1-small"
}

variable "domain_name" {
  description = "Primary domain name for managed SSL certificate"
  type        = string
}

variable "api_image" {
  description = "Container image for the API service"
  type        = string
}

variable "web_image" {
  description = "Container image for the web service"
  type        = string
}

variable "desired_count_api" {
  description = "Minimum instance count for API Cloud Run service"
  type        = number
  default     = 2
}

variable "desired_count_web" {
  description = "Minimum instance count for web Cloud Run service"
  type        = number
  default     = 2
}

variable "db_name" {
  description = "PostgreSQL database name"
  type        = string
  default     = "nexusops"
}

variable "db_username" {
  description = "PostgreSQL master username"
  type        = string
  default     = "nexusops"
}

variable "db_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true
}

variable "backup_retention_days" {
  description = "Cloud SQL automated backup retention in days"
  type        = number
  default     = 7
}

variable "tags" {
  description = "Additional labels to apply to all resources"
  type        = map(string)
  default     = {}
}
