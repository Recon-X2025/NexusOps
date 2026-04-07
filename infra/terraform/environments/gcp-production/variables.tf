variable "domain_name" {
  description = "Primary domain name for managed SSL certificate and LB routing"
  type        = string
}

variable "api_image" {
  description = "Container image URI for the API Cloud Run service"
  type        = string
}

variable "web_image" {
  description = "Container image URI for the web Cloud Run service"
  type        = string
}

variable "db_password" {
  description = "PostgreSQL master password"
  type        = string
  sensitive   = true
}
