variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
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
  description = "ECS task CPU/memory size (small, medium, large)"
  type        = string
  default     = "medium"
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.medium"
}

variable "redis_node_type" {
  description = "ElastiCache node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "domain_name" {
  description = "Primary domain name for ACM certificate"
  type        = string
}

variable "api_image" {
  description = "Docker image for the API service"
  type        = string
}

variable "web_image" {
  description = "Docker image for the web service"
  type        = string
}

variable "desired_count_api" {
  description = "Desired task count for API service"
  type        = number
  default     = 2
}

variable "desired_count_web" {
  description = "Desired task count for web service"
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

variable "multi_az" {
  description = "Enable Multi-AZ for RDS"
  type        = bool
  default     = false
}

variable "backup_retention_days" {
  description = "RDS automated backup retention in days"
  type        = number
  default     = 7
}

variable "tags" {
  description = "Additional tags to apply to all resources"
  type        = map(string)
  default     = {}
}
