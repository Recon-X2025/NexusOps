output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = module.aws.alb_dns_name
}

output "alb_zone_id" {
  description = "Hosted zone ID of the ALB"
  value       = module.aws.alb_zone_id
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = module.aws.rds_endpoint
}

output "rds_port" {
  description = "RDS PostgreSQL port"
  value       = module.aws.rds_port
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = module.aws.redis_endpoint
}

output "redis_port" {
  description = "ElastiCache Redis port"
  value       = module.aws.redis_port
}

output "ecr_repository_urls" {
  description = "ECR repository URLs for API and web"
  value       = module.aws.ecr_repository_urls
}

output "s3_bucket_name" {
  description = "S3 bucket name for uploads"
  value       = module.aws.s3_bucket_name
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = module.aws.ecs_cluster_name
}

output "acm_certificate_arn" {
  description = "ACM certificate ARN"
  value       = module.aws.acm_certificate_arn
}

output "vpc_id" {
  description = "VPC ID"
  value       = module.aws.vpc_id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = module.aws.private_subnet_ids
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = module.aws.public_subnet_ids
}
