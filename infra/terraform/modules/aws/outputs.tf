output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "alb_zone_id" {
  description = "Hosted zone ID of the ALB"
  value       = aws_lb.main.zone_id
}

output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint"
  value       = aws_db_instance.postgresql.endpoint
}

output "rds_port" {
  description = "RDS PostgreSQL port"
  value       = aws_db_instance.postgresql.port
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].address
}

output "redis_port" {
  description = "ElastiCache Redis port"
  value       = aws_elasticache_cluster.redis.cache_nodes[0].port
}

output "ecr_repository_urls" {
  description = "ECR repository URLs for API and web"
  value = {
    api = aws_ecr_repository.api.repository_url
    web = aws_ecr_repository.web.repository_url
  }
}

output "s3_bucket_name" {
  description = "S3 bucket name for uploads/backups"
  value       = aws_s3_bucket.uploads.bucket
}

output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "acm_certificate_arn" {
  description = "ACM certificate ARN"
  value       = aws_acm_certificate.main.arn
}

output "vpc_id" {
  description = "VPC ID"
  value       = aws_vpc.main.id
}

output "private_subnet_ids" {
  description = "Private subnet IDs"
  value       = aws_subnet.private[*].id
}

output "public_subnet_ids" {
  description = "Public subnet IDs"
  value       = aws_subnet.public[*].id
}
