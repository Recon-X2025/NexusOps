variable "domain_name" {
  description = "Primary domain name for ACM certificate and ALB routing"
  type        = string
}

variable "api_image" {
  description = "Docker image URI for the API service"
  type        = string
}

variable "web_image" {
  description = "Docker image URI for the web service"
  type        = string
}

variable "db_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true
}
