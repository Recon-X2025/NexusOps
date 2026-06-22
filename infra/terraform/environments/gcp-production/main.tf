terraform {
  required_version = ">= 1.6.0"
  backend "gcs" {
    bucket = "nexusops-tfstate-production"
    prefix = "gcp/production"
  }
}

module "gcp" {
  source = "../../modules/gcp"

  region      = "us-central1"
  environment = "production"
  app_name    = "nexusops"

  domain_name = var.domain_name
  api_image   = var.api_image
  web_image   = var.web_image
  db_password = var.db_password

  instance_type         = "medium"
  desired_count_api     = 3
  desired_count_web     = 3
  db_tier               = "db-n1-standard-2"
  backup_retention_days = 14

  tags = {
    owner       = "platform-engineering"
    cost_center = "nexusops-prod"
  }
}
