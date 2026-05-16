.PHONY: up down build logs ps health clean \
        tf-init tf-plan tf-apply tf-destroy \
        k8s-secrets k8s-apply k8s-status k8s-logs \
        install-alb-controller kubeconfig

# ── Local Development ─────────────────────────────────────────────────────────

## Start all services (first run: builds images)
up:
	docker compose up -d --build

## Stop all services
down:
	docker compose down

## Build all images without starting
build:
	docker compose build --parallel

## Tail logs from all services
logs:
	docker compose logs -f

## Show container status
ps:
	docker compose ps

## Health check all services
health:
	@echo "API Gateway:          $$(curl -sf http://localhost:3000/health | jq -r .status 2>/dev/null || echo UNREACHABLE)"
	@echo "Auth Service:         $$(curl -sf http://localhost:3001/health | jq -r .status 2>/dev/null || echo UNREACHABLE)"
	@echo "Notification Service: $$(curl -sf http://localhost:3002/health | jq -r .status 2>/dev/null || echo UNREACHABLE)"
	@echo "Analytics Service:    $$(curl -sf http://localhost:3004/health | jq -r .status 2>/dev/null || echo UNREACHABLE)"

## Remove all containers, volumes (full reset)
clean:
	docker compose down -v --remove-orphans

## Scale delivery workers (usage: make scale-delivery N=5)
scale-delivery:
	docker compose up -d --scale delivery-service=$(N)

# ── Terraform — AWS Infrastructure ───────────────────────────────────────────

TF_DIR = infrastructure/terraform/environments/production

## Initialize Terraform (first time per machine)
tf-init:
	cd $(TF_DIR) && terraform init

## Preview infrastructure changes
tf-plan:
	cd $(TF_DIR) && terraform plan

## Apply infrastructure changes
tf-apply:
	cd $(TF_DIR) && terraform apply

## Destroy all infrastructure (CAREFUL — deletes everything)
tf-destroy:
	cd $(TF_DIR) && terraform destroy

## Show all Terraform outputs (ECR URLs, DB hosts, Redis endpoint)
tf-output:
	cd $(TF_DIR) && terraform output

# ── Kubernetes ────────────────────────────────────────────────────────────────

## Configure kubectl for the EKS cluster
kubeconfig:
	aws eks update-kubeconfig --region ap-southeast-2 --name pingpulse-production

## Create K8s secrets from AWS Secrets Manager (run once after tf-apply)
k8s-secrets:
	cd $(TF_DIR) && bash ../../../../scripts/k8s-secrets.sh

## Initialize DB schemas on RDS (run once after tf-apply)
k8s-db-init:
	@echo "Fetching DB hosts and passwords from Terraform..."
	@cd $(TF_DIR) && \
	DB_HOST_AUTH=$$(terraform output -raw rds_auth_host) \
	DB_HOST_NOTIF=$$(terraform output -raw rds_notifications_host) \
	DB_HOST_ANALYTICS=$$(terraform output -raw rds_analytics_host) \
	DB_PASS_AUTH=$$(aws secretsmanager get-secret-value \
	  --secret-id $$(terraform output -raw rds_auth_password_secret_arn) \
	  --query SecretString --output text) \
	DB_PASS_NOTIF=$$(aws secretsmanager get-secret-value \
	  --secret-id $$(terraform output -raw rds_notifications_password_secret_arn) \
	  --query SecretString --output text) \
	DB_PASS_ANALYTICS=$$(aws secretsmanager get-secret-value \
	  --secret-id $$(terraform output -raw rds_analytics_password_secret_arn) \
	  --query SecretString --output text) \
	bash ../../../../scripts/db-init.sh

## Apply all K8s manifests
k8s-apply:
	bash scripts/k8s-apply.sh

## Show pod status
k8s-status:
	kubectl get pods,svc,ingress -n pingpulse

## Stream pod logs (usage: make k8s-logs SVC=api-gateway)
k8s-logs:
	kubectl logs -f -l app=$(SVC) -n pingpulse

## Install AWS Load Balancer Controller (required for ingress)
install-alb-controller:
	helm repo add eks https://aws.github.io/eks-charts
	helm repo update
	helm upgrade --install aws-load-balancer-controller eks/aws-load-balancer-controller \
	  -n kube-system \
	  --set clusterName=pingpulse-production \
	  --set serviceAccount.create=true \
	  --set serviceAccount.annotations."eks\.amazonaws\.com/role-arn"=$(ALB_ROLE_ARN)

# ── Redis monitoring ──────────────────────────────────────────────────────────

## Show pending messages in delivery stream (local)
redis-pending:
	docker exec pp-redis redis-cli XPENDING pp:stream:notifications delivery-workers - + 10

## Show stream lengths (local)
redis-info:
	@echo "Notifications stream: $$(docker exec pp-redis redis-cli XLEN pp:stream:notifications) messages"
	@echo "Deliveries stream:    $$(docker exec pp-redis redis-cli XLEN pp:stream:deliveries) messages"
