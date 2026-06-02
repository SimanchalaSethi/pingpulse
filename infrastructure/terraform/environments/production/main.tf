terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.47"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

locals {
  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
    Repository  = "pingpulse"
  }
}

# ── ECR Repositories (one per service) ───────────────────────────────────────

module "ecr" {
  source = "../../modules/ecr"

  project_name = var.project_name
  environment  = var.environment
  services     = ["api-gateway", "auth-service", "notification-service", "delivery-service", "analytics-service", "frontend"]
  tags         = local.common_tags
}

# ── Networking ────────────────────────────────────────────────────────────────

module "vpc" {
  source = "../../modules/vpc"

  project_name = var.project_name
  environment  = var.environment
  aws_region   = var.aws_region
  vpc_cidr     = var.vpc_cidr
  tags         = local.common_tags
}

# ── EKS Cluster ───────────────────────────────────────────────────────────────

module "eks" {
  source = "../../modules/eks"

  project_name       = var.project_name
  environment        = var.environment
  vpc_id             = module.vpc.vpc_id
  private_subnet_ids = module.vpc.private_subnet_ids
  cluster_version    = var.eks_cluster_version
  node_groups        = var.eks_node_groups
  tags               = local.common_tags
}

# ── PostgreSQL — one database per service ─────────────────────────────────────

module "rds_auth" {
  source = "../../modules/rds"

  project_name               = var.project_name
  environment                = var.environment
  service_name               = "auth"
  database_name              = "auth_db"
  vpc_id                     = module.vpc.vpc_id
  subnet_ids                 = module.vpc.private_subnet_ids
  allowed_security_group_ids = [module.eks.node_security_group_id]
  instance_class             = var.rds_instance_class
  allocated_storage          = var.rds_allocated_storage
  multi_az                   = var.rds_multi_az
  deletion_protection        = var.rds_deletion_protection
  skip_final_snapshot        = var.rds_skip_final_snapshot
  tags                       = local.common_tags
}

module "rds_notifications" {
  source = "../../modules/rds"

  project_name               = var.project_name
  environment                = var.environment
  service_name               = "notifications"
  database_name              = "notifications_db"
  vpc_id                     = module.vpc.vpc_id
  subnet_ids                 = module.vpc.private_subnet_ids
  allowed_security_group_ids = [module.eks.node_security_group_id]
  instance_class             = var.rds_instance_class
  allocated_storage          = var.rds_allocated_storage
  multi_az                   = var.rds_multi_az
  deletion_protection        = var.rds_deletion_protection
  skip_final_snapshot        = var.rds_skip_final_snapshot
  tags                       = local.common_tags
}

module "rds_analytics" {
  source = "../../modules/rds"

  project_name               = var.project_name
  environment                = var.environment
  service_name               = "analytics"
  database_name              = "analytics_db"
  vpc_id                     = module.vpc.vpc_id
  subnet_ids                 = module.vpc.private_subnet_ids
  allowed_security_group_ids = [module.eks.node_security_group_id]
  instance_class             = var.rds_instance_class
  allocated_storage          = var.rds_allocated_storage
  multi_az                   = var.rds_multi_az
  deletion_protection        = var.rds_deletion_protection
  skip_final_snapshot        = var.rds_skip_final_snapshot
  tags                       = local.common_tags
}

# ── Redis (ElastiCache) ───────────────────────────────────────────────────────

module "elasticache" {
  source = "../../modules/elasticache"

  project_name               = var.project_name
  environment                = var.environment
  vpc_id                     = module.vpc.vpc_id
  subnet_ids                 = module.vpc.private_subnet_ids
  allowed_security_group_ids = [module.eks.node_security_group_id]
  node_type                  = var.elasticache_node_type
  num_nodes                  = var.elasticache_num_nodes
  tags                       = local.common_tags
}

# ── JWT Secret in Secrets Manager ────────────────────────────────────────────

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "jwt" {
  name                    = "${var.project_name}/${var.environment}/jwt-secret"
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "jwt" {
  secret_id     = aws_secretsmanager_secret.jwt.id
  secret_string = random_password.jwt_secret.result
}
