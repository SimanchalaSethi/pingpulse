#!/usr/bin/env bash
# Applies database schemas to all 3 RDS instances after `terraform apply`.
# Run once per environment, or after dropping/recreating databases.
#
# Usage: DB_HOST_AUTH=xxx DB_HOST_NOTIF=xxx DB_HOST_ANALYTICS=xxx \
#          DB_PASS_AUTH=xxx DB_PASS_NOTIF=xxx DB_PASS_ANALYTICS=xxx \
#          ./scripts/db-init.sh
set -euo pipefail

CYAN='\033[0;36m'; GREEN='\033[0;32m'; NC='\033[0m'
log() { echo -e "${CYAN}[db-init]${NC} $*"; }
ok()  { echo -e "${GREEN}[  OK  ]${NC} $*"; }

: "${DB_HOST_AUTH:?Set DB_HOST_AUTH to RDS auth host}"
: "${DB_HOST_NOTIF:?Set DB_HOST_NOTIF to RDS notifications host}"
: "${DB_HOST_ANALYTICS:?Set DB_HOST_ANALYTICS to RDS analytics host}"
: "${DB_PASS_AUTH:?Set DB_PASS_AUTH}"
: "${DB_PASS_NOTIF:?Set DB_PASS_NOTIF}"
: "${DB_PASS_ANALYTICS:?Set DB_PASS_ANALYTICS}"

log "Applying auth_db schema..."
PGPASSWORD="$DB_PASS_AUTH" psql \
  -h "$DB_HOST_AUTH" -U postgres -d auth_db \
  -f database/auth/init.sql
ok "auth_db done"

log "Applying notifications_db schema..."
PGPASSWORD="$DB_PASS_NOTIF" psql \
  -h "$DB_HOST_NOTIF" -U postgres -d notifications_db \
  -f database/notifications/init.sql
ok "notifications_db done"

log "Applying analytics_db schema..."
PGPASSWORD="$DB_PASS_ANALYTICS" psql \
  -h "$DB_HOST_ANALYTICS" -U postgres -d analytics_db \
  -f database/analytics/init.sql
ok "analytics_db done"

ok "All schemas applied."
