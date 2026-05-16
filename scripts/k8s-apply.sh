#!/usr/bin/env bash
# Applies all Kubernetes manifests in the correct order.
# Run after: k8s-secrets.sh and after updating configmap.yaml with TF outputs.
#
# Usage: ./scripts/k8s-apply.sh [--image-tag <sha>]
set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; NC='\033[0m'
log() { echo -e "${CYAN}[k8s]${NC} $*"; }
ok()  { echo -e "${GREEN}[ OK ]${NC} $*"; }

IMAGE_TAG="${2:-latest}"
NS="pingpulse"

log "Applying namespace..."
kubectl apply -f k8s/namespace.yaml

log "Applying ConfigMap..."
kubectl apply -f k8s/configmap.yaml

log "Applying deployments and services..."
for SVC in auth-service notification-service delivery-service analytics-service api-gateway frontend; do
  kubectl apply -f "k8s/$SVC/deployment.yaml"
  kubectl apply -f "k8s/$SVC/service.yaml"
done

# HPA
kubectl apply -f k8s/delivery-service/hpa.yaml

log "Applying Ingress..."
kubectl apply -f k8s/ingress.yaml

if [ "$IMAGE_TAG" != "latest" ]; then
  log "Updating image tags to: $IMAGE_TAG"
  ECR_REGISTRY=$(aws ecr describe-repositories \
    --query 'repositories[0].repositoryUri' --output text | cut -d'/' -f1)

  for SVC in api-gateway auth-service notification-service delivery-service analytics-service frontend; do
    kubectl set image "deployment/$SVC" \
      "$SVC=$ECR_REGISTRY/pingpulse/$SVC:$IMAGE_TAG" \
      -n "$NS"
  done
fi

log "Waiting for all deployments to roll out..."
for DEPLOY in api-gateway auth-service notification-service delivery-service analytics-service frontend; do
  kubectl rollout status "deployment/$DEPLOY" -n "$NS" --timeout=300s
done

ok "All services deployed!"
kubectl get pods -n "$NS"
kubectl get ingress -n "$NS"
