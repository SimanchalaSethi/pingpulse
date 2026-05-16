#!/usr/bin/env bash
# Fetches all secrets from AWS Secrets Manager and creates Kubernetes Secret.
# Run ONCE after `terraform apply` before first `kubectl apply`.
#
# Prerequisites:
#   - AWS CLI configured (aws configure or env vars)
#   - kubectl pointed at the EKS cluster
#   - terraform outputs available (run: terraform output -json)
#
# Usage:
#   cd infrastructure/terraform/environments/production
#   ./../../../../scripts/k8s-secrets.sh
set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; NC='\033[0m'
log() { echo -e "${CYAN}[secrets]${NC} $*"; }
ok()  { echo -e "${GREEN}[  OK  ]${NC} $*"; }

AWS_REGION="${AWS_REGION:-ap-southeast-2}"
NAMESPACE="pingpulse"

log "Fetching Terraform outputs..."
TF_OUTPUTS=$(terraform output -json)

AUTH_SECRET_ARN=$(echo "$TF_OUTPUTS"     | jq -r '.rds_auth_password_secret_arn.value')
NOTIF_SECRET_ARN=$(echo "$TF_OUTPUTS"    | jq -r '.rds_notifications_password_secret_arn.value')
ANALYTICS_SECRET_ARN=$(echo "$TF_OUTPUTS" | jq -r '.rds_analytics_password_secret_arn.value')
JWT_SECRET_ARN=$(echo "$TF_OUTPUTS"      | jq -r '.jwt_secret_arn.value')

log "Fetching secrets from AWS Secrets Manager..."
AUTH_DB_PASS=$(aws secretsmanager get-secret-value \
  --secret-id "$AUTH_SECRET_ARN" --region "$AWS_REGION" \
  --query SecretString --output text)

NOTIF_DB_PASS=$(aws secretsmanager get-secret-value \
  --secret-id "$NOTIF_SECRET_ARN" --region "$AWS_REGION" \
  --query SecretString --output text)

ANALYTICS_DB_PASS=$(aws secretsmanager get-secret-value \
  --secret-id "$ANALYTICS_SECRET_ARN" --region "$AWS_REGION" \
  --query SecretString --output text)

JWT_SECRET=$(aws secretsmanager get-secret-value \
  --secret-id "$JWT_SECRET_ARN" --region "$AWS_REGION" \
  --query SecretString --output text)

log "Creating Kubernetes namespace (if not exists)..."
kubectl apply -f k8s/namespace.yaml 2>/dev/null || true

log "Creating Kubernetes secret..."
kubectl create secret generic pingpulse-secrets \
  --namespace "$NAMESPACE" \
  --from-literal=JWT_SECRET="$JWT_SECRET" \
  --from-literal=AUTH_POSTGRES_PASSWORD="$AUTH_DB_PASS" \
  --from-literal=NOTIF_POSTGRES_PASSWORD="$NOTIF_DB_PASS" \
  --from-literal=ANALYTICS_POSTGRES_PASSWORD="$ANALYTICS_DB_PASS" \
  --from-literal=SMTP_USER="${SMTP_USER:-}" \
  --from-literal=SMTP_PASSWORD="${SMTP_PASSWORD:-}" \
  --dry-run=client -o yaml | kubectl apply -f -

ok "Kubernetes secret 'pingpulse-secrets' created in namespace '$NAMESPACE'"
ok "Next: kubectl apply -f k8s/configmap.yaml"
ok "Then: kubectl apply -f k8s/ -R"
