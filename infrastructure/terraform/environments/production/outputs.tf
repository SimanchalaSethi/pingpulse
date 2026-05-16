output "ecr_repository_urls" {
  description = "ECR URLs for each service — used in CI/CD"
  value       = module.ecr.repository_urls
}

output "eks_cluster_name" {
  description = "EKS cluster name — for kubectl config"
  value       = module.eks.cluster_name
}

output "eks_cluster_endpoint" {
  value = module.eks.cluster_endpoint
}

output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = module.elasticache.primary_endpoint
}

output "rds_auth_host" {
  value = module.rds_auth.host
}

output "rds_notifications_host" {
  value = module.rds_notifications.host
}

output "rds_analytics_host" {
  value = module.rds_analytics.host
}

output "rds_auth_password_secret_arn" {
  value = module.rds_auth.password_secret_arn
}

output "rds_notifications_password_secret_arn" {
  value = module.rds_notifications.password_secret_arn
}

output "rds_analytics_password_secret_arn" {
  value = module.rds_analytics.password_secret_arn
}

output "jwt_secret_arn" {
  value = aws_secretsmanager_secret.jwt.arn
}

output "kubeconfig_command" {
  description = "Run this to configure kubectl"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${module.eks.cluster_name}"
}
