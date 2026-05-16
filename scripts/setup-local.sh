#!/usr/bin/env bash
# One-command local setup — brings up all services fresh from scratch.
# Usage: ./scripts/setup-local.sh
set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

log()  { echo -e "${CYAN}[pingpulse]${NC} $*"; }
ok()   { echo -e "${GREEN}[  OK  ]${NC} $*"; }
warn() { echo -e "${YELLOW}[ WARN ]${NC} $*"; }

# ── Prereq check ─────────────────────────────────────────────────────────────
for cmd in docker curl; do
  command -v "$cmd" &>/dev/null || { echo "ERROR: $cmd not installed"; exit 1; }
done

if ! docker info &>/dev/null; then
  echo "ERROR: Docker daemon is not running. Start Docker Desktop."
  exit 1
fi

log "Stopping any existing containers..."
docker compose down --remove-orphans 2>/dev/null || true

log "Building all images (this takes 2-4 minutes on first run)..."
docker compose build --parallel

log "Starting all services..."
docker compose up -d

log "Waiting for services to become healthy..."
TIMEOUT=120
ELAPSED=0
SERVICES="pp-api-gateway pp-auth-service pp-notification-service pp-analytics-service"

while [ $ELAPSED -lt $TIMEOUT ]; do
  ALL_HEALTHY=true
  for SVC in $SERVICES; do
    STATUS=$(docker inspect --format='{{.State.Health.Status}}' "$SVC" 2>/dev/null || echo "missing")
    if [ "$STATUS" != "healthy" ]; then
      ALL_HEALTHY=false
      break
    fi
  done

  if $ALL_HEALTHY; then
    break
  fi

  sleep 5
  ELAPSED=$((ELAPSED + 5))
  log "Waiting... (${ELAPSED}s)"
done

if ! $ALL_HEALTHY; then
  warn "Some services may not be healthy yet. Check: docker compose ps"
fi

echo ""
ok "PingPulse is running!"
echo ""
echo "  Frontend dashboard:  http://localhost:5173"
echo "  API Gateway:         http://localhost:3000"
echo "  Mailhog (emails):    http://localhost:8025"
echo "  Grafana:             http://localhost:3005  (admin/admin)"
echo "  Prometheus:          http://localhost:9090"
echo ""
echo "  Health checks:"
echo "    curl http://localhost:3000/health"
echo "    curl http://localhost:3001/health"
echo "    curl http://localhost:3002/health"
echo "    curl http://localhost:3004/health"
echo ""
echo "  Logs:  docker compose logs -f"
echo "  Stop:  docker compose down"
