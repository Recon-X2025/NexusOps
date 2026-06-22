terraform {
  required_version = ">= 1.6.0"
  backend "s3" {
    bucket = "nexusops-tfstate-production"
    key    = "aws/production/terraform.tfstate"
    region = "us-east-1"
  }
}

module "aws" {
  source = "../../modules/aws"

  region      = "us-east-1"
  environment = "production"
  app_name    = "nexusops"

  domain_name = var.domain_name
  api_image   = var.api_image
  web_image   = var.web_image
  db_password = var.db_password

  instance_type         = "medium"
  desired_count_api     = 3
  desired_count_web     = 3
  db_instance_class     = "db.t3.medium"
  redis_node_type       = "cache.t3.micro"
  multi_az              = true
  backup_retention_days = 14

  tags = {
    Owner      = "platform-engineering"
    CostCenter = "nexusops-prod"
  }
}
