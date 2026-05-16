# PingPulse

**Production-grade multi-channel notification platform — event-driven microservices on AWS EKS.**

Send notifications across email and webhooks from a single API. Fully self-contained: runs locally with one command, deploys to AWS with Terraform + GitHub Actions.

[![CI](https://github.com/SimanchalaSethi/pingpulse/actions/workflows/ci.yml/badge.svg)](https://github.com/SimanchalaSethi/pingpulse/actions/workflows/ci.yml)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green)](https://nodejs.org/)
[![Redis Streams](https://img.shields.io/badge/Redis-7%20Streams-red)](https://redis.io/docs/data-types/streams/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker-Compose-blue)](https://docs.docker.com/compose/)
[![Terraform](https://img.shields.io/badge/Terraform-1.6+-purple)](https://www.terraform.io/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-EKS-orange)](https://aws.amazon.com/eks/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## Table of Contents

1. [What Is This?](#what-is-this)
2. [Run Locally — One Command](#run-locally--one-command)
3. [Architecture Overview](#architecture-overview)
4. [End-to-End Request Flow](#end-to-end-request-flow)
5. [Service Breakdown](#service-breakdown)
6. [Database Schemas](#database-schemas)
7. [Redis Stream Contracts](#redis-stream-contracts)
8. [API Reference — Every Endpoint](#api-reference--every-endpoint)
9. [Frontend Dashboard](#frontend-dashboard)
10. [Tech Stack](#tech-stack)
11. [Project Structure](#project-structure)
12. [Deploy to AWS — Full Guide](#deploy-to-aws--full-guide)
13. [CI/CD Pipeline](#cicd-pipeline)
14. [Observability — Prometheus + Grafana](#observability--prometheus--grafana)
15. [Key Design Decisions](#key-design-decisions)
16. [Scalability Analysis](#scalability-analysis)
17. [Production Gaps (What to Add Next)](#production-gaps)
18. [Interview Q&A](#interview-qa)

---

## What Is This?

PingPulse is a **notification delivery platform** — the kind of system behind "Your payment failed", "Your order shipped", or "New login from Sydney" messages.

**What it does at a high level:**
- You make one API call: `POST /api/v1/notifications` with a list of channel IDs and a data payload
- The API returns `202 Accepted` immediately (delivery is async)
- Behind the scenes, 2 delivery workers fan-out to every channel concurrently — email, webhook
- Every delivery outcome (success/failure, latency) is tracked in an analytics database
- A React dashboard shows you delivery rates, failures, and channel breakdowns in real time

**This is the same architecture used by:**
- [Courier](https://courier.com) — notification orchestration platform
- [Knock](https://knock.app) — notification infrastructure
- [Novu](https://novu.co) — open-source notification platform
- Internal notification systems at Stripe, Twilio, SendGrid

---

## Run Locally — One Command

**Prerequisites:** Docker Desktop installed and running. Nothing else required.

```bash
git clone https://github.com/SimanchalaSethi/pingpulse.git
cd pingpulse

# Start everything (builds images on first run, ~2-4 minutes)
make up

# OR
docker compose up -d --build
```

**That's it.** All 11 containers start: 5 microservices, 3 PostgreSQL databases, Redis, Mailhog, Nginx frontend, Prometheus, Grafana.

### What's running

| URL | What |
|-----|------|
| http://localhost:5173 | React dashboard (login/register here) |
| http://localhost:3000 | API Gateway (all API calls go here) |
| http://localhost:8025 | Mailhog — captures all outbound email |
| http://localhost:3005 | Grafana dashboards (admin/admin) |
| http://localhost:9090 | Prometheus metrics |

### Verify everything is healthy

```bash
make health

# Or manually:
curl http://localhost:3000/health   # api-gateway
curl http://localhost:3001/health   # auth-service
curl http://localhost:3002/health   # notification-service
curl http://localhost:3004/health   # analytics-service
```

### Try it in 5 commands

```bash
# 1. Register
curl -s -X POST http://localhost:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"demo@example.com","password":"demo1234"}' | jq .

# Copy the token from the response, then:
TOKEN="eyJ..."

# 2. Create an email channel
curl -s -X POST http://localhost:3000/api/v1/channels \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type":"email","name":"Team Alerts","config":{"to":"team@example.com","from":"noreply@pingpulse.local"}}' | jq .

CHANNEL_ID="<paste id from response>"

# 3. Send a notification (returns 202 immediately)
curl -s -X POST http://localhost:3000/api/v1/notifications \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"type\":\"payment.failed\",\"channels\":[\"$CHANNEL_ID\"],\"data\":{\"amount\":99.99}}" | jq .

# 4. Check the email at http://localhost:8025

# 5. Check delivery analytics
curl -s http://localhost:3000/api/v1/analytics/summary -H "Authorization: Bearer $TOKEN" | jq .
```

### Other useful commands

```bash
make logs                     # tail all service logs
make ps                       # container status
make scale-delivery N=5       # scale delivery workers to 5
make redis-pending            # check message backlog
make redis-info               # stream lengths
make clean                    # full reset (removes all volumes/data)
```

---

## Architecture Overview

```
                    ┌────────────────────────────────────────────────────┐
                    │            BROWSER  http://localhost:5173           │
                    │       React SPA served by Nginx container           │
                    └───────────────────────┬────────────────────────────┘
                                            │ /api/* proxied to api-gateway
                    ┌───────────────────────▼────────────────────────────┐
                    │              API GATEWAY  :3000                     │
                    │  ┌─────────────────────────────────────────────┐   │
                    │  │  JWT / API-key auth  •  Rate limiting        │   │
                    │  │  http-proxy-middleware → downstream services │   │
                    │  └─────────────────────────────────────────────┘   │
                    └──────┬───────────────┬───────────────┬─────────────┘
                           │               │               │
            ┌──────────────▼───┐  ┌────────▼──────┐  ┌────▼────────────┐
            │  AUTH SERVICE    │  │NOTIFICATION   │  │ANALYTICS SERVICE│
            │     :3001        │  │SERVICE  :3002 │  │    :3004        │
            │                  │  │               │  │                 │
            │  POST /register  │  │POST /notifs   │  │GET /summary     │
            │  POST /login     │  │GET  /notifs   │  │GET /by-channel  │
            │  POST /api-keys  │  │POST /channels │  │                 │
            │  GET  /api-keys  │  │GET  /channels │  │  analytics_db   │
            │                  │  │POST /templates│  │  (PostgreSQL)   │
            │    auth_db       │  │               │  └────────▲────────┘
            │  (PostgreSQL)    │  │ notifications_db           │ consumes
            └──────────────────┘  │  (PostgreSQL)  │           │
                                  └───────┬────────┘           │
                                          │ XADD               │
                                  ┌───────▼────────────────────┴──────┐
                                  │          Redis 7 Streams            │
                                  │                                     │
                                  │  pp:stream:notifications            │
                                  │  consumer-group: delivery-workers   │
                                  │                                     │
                                  │  pp:stream:deliveries               │
                                  │  consumer-group: analytics-workers  │
                                  └───────────────┬────────────────────┘
                                                  │ XREADGROUP
                                  ┌───────────────▼────────────────────┐
                                  │      DELIVERY SERVICE  :3003        │
                                  │  (2 replicas — consumer group)      │
                                  │                                     │
                                  │  ┌─────────────┐  ┌─────────────┐  │
                                  │  │EmailChannel │  │WebhookChannel│ │
                                  │  │(Nodemailer) │  │(Axios+HMAC) │  │
                                  │  └─────────────┘  └─────────────┘  │
                                  └────────────────────────────────────┘
```

### Two communication styles

| Style | Used between | Reason |
|-------|-------------|--------|
| Synchronous REST | Gateway → auth-service (validate token) | Need an immediate auth decision |
| Synchronous REST | delivery-service → notification-service (fetch channel config) | Need channel details before delivering |
| Async Redis Stream | notification-service → delivery-service | Don't block the API caller on slow SMTP/webhooks |
| Async Redis Stream | delivery-service → analytics-service | Delivery outcome is fire-and-forget |

---

## End-to-End Request Flow

### Sending a notification

```
1.  POST http://localhost:3000/api/v1/notifications
    Authorization: Bearer eyJhbGc...
    Body: { type, channels: ["chan-1","chan-2"], data: {...} }

2.  API GATEWAY
    → calls GET http://auth-service:3001/internal/validate
    ← gets back: { workspaceId, userId, email }
    → injects headers: x-workspace-id, x-user-id
    → checks rate limit: ZADD/ZCARD ratelimit:<workspaceId> in Redis
    → proxies request to notification-service

3.  NOTIFICATION SERVICE
    → validates all channel IDs exist and belong to this workspace
    → INSERT INTO notifications (id, workspace_id, type, status='queued', data)
    → XADD pp:stream:notifications * notificationId <uuid> workspaceId <wid>
         channels '["chan-1","chan-2"]' data '{"amount":99.99}' timestamp ...
    ← returns HTTP 202 Accepted: { id: "notif-uuid", status: "queued" }

4.  API GATEWAY → CLIENT: 202 Accepted (client doesn't wait for delivery)

5.  DELIVERY SERVICE (one of 2 replicas picks up the message)
    → XREADGROUP GROUP delivery-workers worker-abc COUNT 10 BLOCK 2000
         STREAMS pp:stream:notifications >
    → For each channelId:
         GET http://notification-service:3002/internal/channels/<id>
         Returns: { type: "email", config: { to: "...", from: "..." } }
    → Promise.allSettled([emailChannel.deliver(...), webhookChannel.deliver(...)])
         ← concurrent fan-out; one channel failure doesn't block others

6.  EMAIL CHANNEL
    → If templateId: POST /internal/render-template → Handlebars compile
    → nodemailer.sendMail({ to, subject, html })
    → Mailhog catches it locally (no real email sent in dev)

    WEBHOOK CHANNEL
    → axios.post(webhookUrl, payload)
    → If signingSecret: X-Signature: sha256=HMAC(secret, body)

7.  Each delivery (success or failure):
    → XADD pp:stream:deliveries * deliveryId <uuid> notificationId <nid>
         channelType email status delivered durationMs 312 ...
    → XACK pp:stream:notifications delivery-workers <messageId>

8.  ANALYTICS SERVICE
    → XREADGROUP GROUP analytics-workers worker-xyz STREAMS pp:stream:deliveries >
    → INSERT INTO delivery_events ... ON CONFLICT (id) DO NOTHING  ← idempotent
    → XACK

9.  CLIENT polls:
    GET /api/v1/analytics/notifications/<notif-id>
    ← { channels: [{type:"email", status:"delivered", durationMs:312}] }
```

### Authentication flow

```
JWT:
  POST /api/v1/auth/login → auth-service signs JWT { userId, workspaceId }
  Client sends: Authorization: Bearer <jwt>
  Gateway → GET /internal/validate → auth-service verifies signature
  Gateway injects x-workspace-id header → downstream services trust it

API Key (for server-to-server):
  POST /api/v1/api-keys → auth-service generates:
    key = "pp_" + randomHex(8) + "_" + randomHex(32)
    Stores: key_prefix (first 8 chars, plaintext for O(1) lookup)
            key_hash (bcrypt of full key)
  Client sends: Authorization: ApiKey pp_abc123_...
  Gateway: extract prefix → DB lookup → bcrypt.compare(incoming, stored_hash)
```

---

## Service Breakdown

### 1. API Gateway (:3000)

The **single entry point** for all traffic. Nothing bypasses it.

**What it does:**
- Route `/api/v1/auth/*` → auth-service (no auth check — public)
- Route all other `/api/v1/*` → appropriate downstream service
- Validate JWT/API key by calling auth-service `/internal/validate`
- Apply sliding-window rate limiting (Redis, per workspace, configurable req/min)

**Critical implementation detail — `pathFilter` not `app.use(path, ...)`:**

`app.use('/api/v1/auth', proxyMiddleware)` causes Express to strip the prefix from `req.url` before the proxy sees it. So the proxy receives `/register` instead of `/api/v1/auth/register` — `pathRewrite` never matches and you get 404.

Fix: use `pathFilter` inside `createProxyMiddleware`. The full URL is preserved.

```typescript
// WRONG — Express strips prefix, pathRewrite never matches
app.use('/api/v1/auth', createProxyMiddleware({ pathRewrite: {'^/api/v1/auth': '/auth'} }))

// CORRECT — pathFilter keeps full URL for pathRewrite
app.use(createProxyMiddleware({
  pathFilter: '/api/v1/auth',
  target: SERVICES.auth,
  pathRewrite: { '^/api/v1/auth': '/auth' },
}))
```

Files: `services/api-gateway/src/index.ts`, `middleware/auth.ts`, `middleware/rateLimit.ts`

---

### 2. Auth Service (:3001)

**Owns all identity and access data.**

- Users, hashed passwords (bcrypt 12 rounds)
- Workspaces — each user gets one on registration
- JWT generation (HS256, configurable expiry)
- API keys — prefix stored plaintext, full key bcrypt-hashed

**Internal endpoints** (called by gateway only, not exposed via proxy):
- `GET /internal/validate` — verifies JWT or API key, returns `{ workspaceId, userId }`

**Why this matters:** The gateway never holds the JWT secret. `JWT_SECRET` lives only in auth-service. To rotate it, restart auth-service — nothing else changes.

Files: `services/auth-service/src/routes/auth.ts`, `routes/apiKeys.ts`, `routes/internal.ts`, `services/AuthService.ts`

---

### 3. Notification Service (:3002)

**Owns notifications, channels, and templates.**

- Validates incoming notification request (channel IDs belong to workspace)
- Persists notification to `notifications_db`
- Publishes event to Redis Stream → triggers async delivery
- Returns 202 immediately — delivery is not its job

**Internal endpoints** (called by delivery-service):
- `GET /internal/channels/:id` — returns channel type + JSONB config (email address, webhook URL, etc.)
- `POST /internal/render-template` — Handlebars compile with provided data

**What it does NOT do:** It never sends email or hits webhooks. That's delivery-service's responsibility.

Files: `services/notification-service/src/routes/notifications.ts`, `routes/channels.ts`, `routes/templates.ts`, `routes/internal.ts`, `events/publisher.ts`

---

### 4. Delivery Service (:3003, 2 replicas)

**The engine that actually sends messages.**

This service has **no database**. It is a stateless consumer:
1. `XREADGROUP` from `pp:stream:notifications` (consumer group: `delivery-workers`)
2. For each channel in the notification: `GET /internal/channels/:id` → fetch type + config
3. `Promise.allSettled([...])` — fan-out to all channels concurrently
4. Each channel result → `XADD` to `pp:stream:deliveries`
5. `XACK` the processed message

**Channel implementations:**
- **EmailChannel** — Nodemailer SMTP. Calls `/internal/render-template` if a templateId is set.
- **WebhookChannel** — Axios POST. If `signingSecret` in channel config: adds `X-Signature: sha256=HMAC(secret, rawBody)`.

**Why 2 replicas?** Redis consumer groups distribute messages between all consumers in the group. Worker A gets message 1, Worker B gets message 2 — never both get the same message. Scale to 20 replicas without any code change.

Files: `services/delivery-service/src/index.ts`, `channels/EmailChannel.ts`, `channels/WebhookChannel.ts`, `events/publisher.ts`

---

### 5. Analytics Service (:3004)

**Append-only delivery tracking.**

Consumes every `delivery.attempted` event and writes it to `analytics_db` with `ON CONFLICT DO NOTHING` (idempotent — safe to process the same event twice).

Exposes read-only query endpoints used by the dashboard.

Files: `services/analytics-service/src/index.ts`, `routes/analytics.ts`

---

## Database Schemas

Three completely independent PostgreSQL databases. No cross-database foreign keys. No shared migrations.

### auth_db

```sql
CREATE TABLE workspaces (
  id         UUID PRIMARY KEY,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE users (
  id            UUID PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  workspace_id  UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE api_keys (
  id           UUID PRIMARY KEY,
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  key_prefix   TEXT NOT NULL,   -- first 8 chars — for O(1) lookup
  key_hash     TEXT NOT NULL,   -- bcrypt hash of full key
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email    ON users(email);
CREATE INDEX idx_users_workspace ON users(workspace_id);
CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);
```

### notifications_db

```sql
CREATE TABLE channels (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  type         VARCHAR(50) NOT NULL,  -- email | webhook
  name         VARCHAR(255) NOT NULL,
  config       JSONB NOT NULL,        -- { to, from } or { url, signingSecret }
  active       BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name         VARCHAR(255) NOT NULL,
  subject      VARCHAR(500),           -- Handlebars syntax
  body         TEXT NOT NULL,          -- Handlebars syntax
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  type         VARCHAR(255) NOT NULL,  -- e.g. "payment.failed"
  status       VARCHAR(50) DEFAULT 'queued',
  template_id  UUID REFERENCES templates(id),
  data         JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE notification_channels (
  notification_id UUID REFERENCES notifications(id),
  channel_id      UUID REFERENCES channels(id),
  PRIMARY KEY (notification_id, channel_id)
);
```

### analytics_db

```sql
CREATE TABLE delivery_events (
  id              UUID PRIMARY KEY,      -- deliveryId from delivery-service
  notification_id UUID NOT NULL,
  workspace_id    UUID NOT NULL,
  channel_id      UUID NOT NULL,
  channel_type    VARCHAR(50) NOT NULL,
  status          VARCHAR(20) NOT NULL,  -- delivered | failed
  status_code     INTEGER,               -- HTTP status for webhooks
  error_message   TEXT,
  attempt_number  INTEGER NOT NULL DEFAULT 1,
  duration_ms     INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_delivery_workspace     ON delivery_events(workspace_id);
CREATE INDEX idx_delivery_notification  ON delivery_events(notification_id);
CREATE INDEX idx_delivery_created       ON delivery_events(created_at DESC);
```

---

## Redis Stream Contracts

Redis Streams are flat key-value stores — no JSON nesting. Arrays and objects are JSON-encoded strings.

### `pp:stream:notifications`

Published by: notification-service  
Consumed by: delivery-service (group: `delivery-workers`)

| Field | Type | Example |
|-------|------|---------|
| `notificationId` | UUID string | `a1b2c3d4-...` |
| `workspaceId` | UUID string | `w1x2y3z4-...` |
| `type` | string | `payment.failed` |
| `channels` | JSON array string | `["c1","c2"]` |
| `templateId` | UUID string or empty | `t1u2v3-...` |
| `data` | JSON object string | `{"amount":99.99}` |
| `timestamp` | ISO 8601 | `2026-04-29T10:00:00Z` |

### `pp:stream:deliveries`

Published by: delivery-service  
Consumed by: analytics-service (group: `analytics-workers`)

| Field | Type | Example |
|-------|------|---------|
| `deliveryId` | UUID string | Unique per delivery attempt |
| `notificationId` | UUID string | Links to notification |
| `workspaceId` | UUID string | |
| `channelId` | UUID string | |
| `channelType` | string | `email` or `webhook` |
| `status` | string | `delivered` or `failed` |
| `statusCode` | string → int | `200`, `500` |
| `errorMessage` | string | `Connection refused` |
| `attemptNumber` | string → int | `1` |
| `durationMs` | string → int | `312` |
| `timestamp` | ISO 8601 | `2026-04-29T10:00:01Z` |

---

## API Reference — Every Endpoint

All authenticated endpoints require:
- `Authorization: Bearer <jwt>` — from login response
- `Authorization: ApiKey <key>` — from create API key response

Base URL (local): `http://localhost:3000`

---

### Auth — `POST /api/v1/auth/register`

No auth required.

**Request:**
```json
{ "email": "you@example.com", "password": "yourpassword" }
```

**Response 201:**
```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": { "id": "uuid", "email": "you@example.com", "workspaceId": "uuid" }
  }
}
```

---

### Auth — `POST /api/v1/auth/login`

No auth required.

**Request:** `{ "email": "...", "password": "..." }`

**Response 200:** Same shape as register.

---

### API Keys — `POST /api/v1/api-keys`

**Request:** `{ "name": "My Server Key" }`

**Response 201:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "My Server Key",
    "key": "pp_abc12345_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
    "createdAt": "2026-04-29T10:00:00Z"
  }
}
```
⚠️ The full `key` is only shown once. Copy it now.

---

### API Keys — `GET /api/v1/api-keys`

Returns all active keys for the workspace. The `key` field is never returned after creation.

---

### API Keys — `DELETE /api/v1/api-keys/:id`

Revokes the key (soft delete via `is_active = false`).

---

### Channels — `POST /api/v1/channels`

**Email channel:**
```json
{
  "type": "email",
  "name": "Team Alerts",
  "config": {
    "to": "team@company.com",
    "from": "noreply@yourapp.com"
  }
}
```

**Webhook channel:**
```json
{
  "type": "webhook",
  "name": "Slack Integration",
  "config": {
    "url": "https://hooks.slack.com/services/T.../B.../xxx",
    "signingSecret": "optional-hmac-secret"
  }
}
```

**Response 201:** `{ success: true, data: { id, type, name, config, createdAt } }`

---

### Channels — `GET /api/v1/channels`

Returns all active channels for the workspace.

---

### Channels — `GET /api/v1/channels/:id`

Returns single channel detail.

---

### Channels — `DELETE /api/v1/channels/:id`

Soft-deletes the channel (`active = false`).

---

### Templates — `POST /api/v1/templates`

```json
{
  "name": "Payment Failed",
  "subject": "Action needed: ${{amount}} charge failed",
  "body": "Hi {{customerName}}, your payment of ${{amount}} failed because: {{reason}}."
}
```

Template bodies use Handlebars syntax. Variables detected from `{{varName}}` patterns.

---

### Templates — `GET /api/v1/templates`

Returns all templates for the workspace.

---

### Templates — `GET /api/v1/templates/:id`

Returns single template.

---

### Templates — `DELETE /api/v1/templates/:id`

---

### Notifications — `POST /api/v1/notifications`

**The main endpoint.** Returns 202 immediately — delivery is async.

```json
{
  "type": "payment.failed",
  "channels": ["channel-uuid-1", "channel-uuid-2"],
  "data": {
    "customerName": "Alice",
    "amount": 99.99,
    "reason": "card_declined"
  },
  "templateId": "template-uuid"
}
```

**Response 202:**
```json
{
  "success": true,
  "data": { "id": "notification-uuid", "status": "queued" }
}
```

---

### Notifications — `GET /api/v1/notifications`

**Query params:** `?page=1&limit=20`

**Response 200:**
```json
{
  "success": true,
  "data": {
    "notifications": [...],
    "total": 142,
    "page": 1,
    "limit": 20
  }
}
```

---

### Notifications — `GET /api/v1/notifications/:id`

Returns notification details + delivery status per channel.

---

### Analytics — `GET /api/v1/analytics/summary`

**Query params:** `?days=7` (default: 7)

**Response 200:**
```json
{
  "success": true,
  "data": {
    "totalSent": 1420,
    "delivered": 1387,
    "failed": 33,
    "deliveryRate": 97.68,
    "avgDurationMs": 289
  }
}
```

---

### Analytics — `GET /api/v1/analytics/by-channel`

**Response 200:**
```json
{
  "success": true,
  "data": [
    { "channelType": "email",   "total": 980, "delivered": 960, "failed": 20, "rate": 97.96 },
    { "channelType": "webhook", "total": 440, "delivered": 427, "failed": 13, "rate": 97.05 }
  ]
}
```

---

### Analytics — `GET /api/v1/analytics/notifications/:id`

Returns per-channel delivery detail for one notification.

---

## Frontend Dashboard

React SPA served from Nginx at `http://localhost:5173`. All API calls go through Nginx's `/api/` proxy to the API gateway — no CORS, no hardcoded service URLs in the browser bundle.

### Pages

| Page | Route | What it shows |
|------|-------|---------------|
| Login | `/login` | Email + password → JWT stored in localStorage |
| Register | `/register` | Create account + workspace |
| Dashboard | `/` | Live stats cards, delivery rate progress bar, recent notifications |
| Notifications | `/notifications` | Paginated table + "Send Notification" modal |
| Channels | `/channels` | Channel list + "Add Channel" modal (type-aware config forms) |
| Templates | `/templates` | Template list + variable chips (detected from `{{var}}` patterns) |
| Analytics | `/analytics` | BarChart (delivered vs failed by channel) + PieChart (volume distribution) |
| API Keys | `/api-keys` | Key list + "Create Key" modal — key shown once with copy button |

### How the Nginx proxy works

```nginx
# frontend/nginx.conf
server {
  listen 80;

  # All /api/ requests → api-gateway (inside Docker network)
  location /api/ {
    proxy_pass http://api-gateway:3000/api/;
  }

  # Everything else → React SPA (handles client-side routing)
  location / {
    root /usr/share/nginx/html;
    try_files $uri $uri/ /index.html;
  }
}
```

The browser never talks directly to any microservice — only to Nginx.

---

## Tech Stack

| Concern | Technology | Why This Choice |
|---------|-----------|-----------------|
| Language | TypeScript 5.6 + Node.js 20 | Same language for all 5 services; typed contracts across boundaries |
| HTTP framework | Express 4 | Mature, minimal, middleware ecosystem |
| API Gateway | http-proxy-middleware | Path-based routing with rewriting |
| Async messaging | Redis 7 Streams + Consumer Groups | Built-in at-least-once, consumer groups, PEL — no Kafka complexity |
| Databases | PostgreSQL 15 (3 separate instances) | Database-per-service; JSONB for flexible channel configs |
| Email | Nodemailer + SMTP | Works with Mailhog locally, SES/SendGrid/Mailgun in prod |
| Webhook signing | HMAC-SHA256 (Node.js crypto) | Industry standard (Stripe, GitHub, Twilio) |
| Templating | Handlebars | Logic-less, XSS-safe by default, compiles to function |
| Auth | JWT (jsonwebtoken) + bcrypt | Stateless — scales horizontally without shared session state |
| Frontend | React 18 + Vite + Material UI | Fast build, full component library, TypeScript native |
| Charts | Recharts | Declarative React charts |
| Containers | Docker multi-stage builds | builder (tsc) → production (node:alpine) — no dev deps in prod image |
| Reverse proxy | Nginx | Serves static files, proxies /api/ — standard setup |
| Dev email catch | Mailhog | No real emails in dev, regardless of "to" address |
| Infrastructure | Terraform + AWS (EKS, RDS, ElastiCache, ECR) | Reproducible, version-controlled infrastructure |
| Orchestration | Kubernetes (EKS) | Scale delivery workers independently; rolling deploys |
| CI/CD | GitHub Actions | Build + push ECR + deploy EKS on every merge to main |
| Metrics | Prometheus + Grafana | Standard observability stack; pre-wired dashboards |

---

## Project Structure

```
pingpulse/
├── Makefile                         ← all commands (make up, make tf-apply, etc.)
├── docker-compose.yml               ← full local stack: 5 services + 3 DBs + Redis + monitoring
├── .env.example                     ← copy to .env for local dev
│
├── scripts/
│   ├── setup-local.sh               ← one-command local setup with health checks
│   ├── k8s-secrets.sh               ← fetch from AWS Secrets Manager → create K8s Secret
│   ├── k8s-apply.sh                 ← apply all K8s manifests in correct order
│   └── db-init.sh                   ← apply SQL schemas to RDS after terraform apply
│
├── services/
│   ├── api-gateway/
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts             ← Express + proxy setup (pathFilter pattern)
│   │       └── middleware/
│   │           ├── auth.ts          ← calls auth-service /internal/validate
│   │           └── rateLimit.ts     ← Redis sliding window rate limiter
│   │
│   ├── auth-service/
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts
│   │       ├── routes/
│   │       │   ├── auth.ts          ← POST /register, POST /login
│   │       │   ├── apiKeys.ts       ← CRUD for API keys
│   │       │   └── internal.ts      ← GET /internal/validate (gateway only)
│   │       └── services/
│   │           └── AuthService.ts   ← JWT sign/verify, bcrypt, workspace creation
│   │
│   ├── notification-service/
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts
│   │       ├── routes/
│   │       │   ├── notifications.ts ← POST /notifications, GET /, GET /:id
│   │       │   ├── channels.ts      ← CRUD for channels
│   │       │   ├── templates.ts     ← CRUD for templates
│   │       │   └── internal.ts      ← GET /internal/channels/:id, POST /render-template
│   │       └── events/
│   │           └── publisher.ts     ← XADD to pp:stream:notifications
│   │
│   ├── delivery-service/
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── index.ts             ← Consumer loop + health HTTP endpoint
│   │       ├── channels/
│   │       │   ├── EmailChannel.ts  ← Nodemailer SMTP + Handlebars rendering
│   │       │   └── WebhookChannel.ts ← Axios POST + HMAC-SHA256 signing
│   │       └── events/
│   │           └── publisher.ts     ← XADD to pp:stream:deliveries
│   │
│   └── analytics-service/
│       ├── Dockerfile
│       └── src/
│           ├── index.ts             ← Consumer loop + HTTP endpoints
│           └── routes/
│               └── analytics.ts     ← GET /summary, /by-channel, /notifications/:id
│
├── frontend/
│   ├── Dockerfile                   ← multi-stage: Vite build → Nginx serve
│   ├── nginx.conf                   ← /api/ proxy + SPA fallback
│   └── src/
│       ├── contexts/AuthContext.tsx ← JWT decode, login/logout
│       ├── api/client.ts           ← Axios + all API functions
│       ├── components/Layout.tsx   ← sidebar nav
│       └── pages/                  ← 8 pages (Login, Dashboard, etc.)
│
├── shared/
│   └── src/
│       ├── types/index.ts          ← shared TypeScript types
│       └── events/index.ts         ← Redis Stream event definitions
│
├── database/
│   ├── auth/init.sql               ← auth_db schema
│   ├── notifications/init.sql      ← notifications_db schema
│   └── analytics/init.sql         ← analytics_db schema
│
├── infrastructure/
│   └── terraform/
│       ├── modules/
│       │   ├── vpc/                ← VPC, subnets, NAT gateways, route tables
│       │   ├── eks/                ← EKS cluster, node groups, IAM roles, OIDC
│       │   ├── rds/                ← RDS PostgreSQL, subnet group, security group, Secrets Manager
│       │   ├── elasticache/        ← Redis replication group, subnet group
│       │   └── ecr/                ← ECR repos (one per service), lifecycle policies
│       └── environments/
│           └── production/
│               ├── backend.tf      ← S3 remote state + DynamoDB locking
│               ├── main.tf         ← calls all modules
│               ├── variables.tf    ← all input variables
│               ├── outputs.tf      ← ECR URLs, DB hosts, cluster name
│               └── terraform.tfvars.example ← copy to terraform.tfvars
│
├── k8s/
│   ├── namespace.yaml
│   ├── configmap.yaml              ← non-secret config (DB hosts, Redis endpoint, etc.)
│   ├── secret.yaml                 ← template only — use k8s-secrets.sh for real values
│   ├── ingress.yaml                ← ALB ingress: /api → api-gateway, / → frontend
│   ├── api-gateway/
│   ├── auth-service/
│   ├── notification-service/
│   ├── delivery-service/           ← includes hpa.yaml (auto-scale 2→20 replicas)
│   ├── analytics-service/
│   └── frontend/
│
├── prometheus/
│   └── prometheus.yml              ← scrape targets for all 5 services
│
├── grafana/
│   ├── provisioning/
│   │   ├── datasources/            ← auto-connects to Prometheus
│   │   └── dashboards/             ← auto-loads dashboard JSON
│   └── dashboards/
│       └── pingpulse-overview.json ← service health, req rate, error rate, latency
│
└── .github/
    └── workflows/
        ├── ci.yml                  ← typecheck + test + docker build on every PR
        └── deploy.yml              ← build → push ECR → deploy EKS on merge to main
```

---

## Deploy to AWS — Full Guide

Everything is automated. You run ~5 commands. The rest is CI/CD.

### Prerequisites

Install these once:
```bash
brew install terraform awscli kubectl helm jq
```

Configure AWS credentials:
```bash
aws configure
# Enter: Access Key ID, Secret Access Key, region (e.g. ap-southeast-2), output format (json)
```

### Step 1 — Create Terraform state backend (once, ever)

```bash
# Create S3 bucket for state
aws s3api create-bucket \
  --bucket pingpulse-terraform-state \
  --region ap-southeast-2 \
  --create-bucket-configuration LocationConstraint=ap-southeast-2

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket pingpulse-terraform-state \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket pingpulse-terraform-state \
  --server-side-encryption-configuration \
  '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name pingpulse-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region ap-southeast-2
```

### Step 2 — Configure Terraform variables

```bash
cd infrastructure/terraform/environments/production
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars — change aws_region if not in Sydney
```

### Step 3 — Provision all AWS infrastructure

```bash
make tf-init    # downloads providers, connects to S3 backend
make tf-plan    # preview what will be created
make tf-apply   # create: VPC, EKS, 3x RDS, ElastiCache, 6x ECR repos
# Takes ~15-20 minutes on first run
```

What Terraform creates:
- VPC with 2 public + 2 private subnets across 2 AZs
- NAT Gateways for outbound internet from private subnets
- EKS cluster (Kubernetes 1.31) with 2 `t3.medium` nodes
- 3 RDS PostgreSQL 15 instances (one per service) with auto-generated passwords in Secrets Manager
- ElastiCache Redis single node
- 6 ECR repositories (one per Docker image)
- IAM roles for EKS cluster + node group
- OIDC provider for IAM Roles for Service Accounts (IRSA)
- JWT secret auto-generated and stored in Secrets Manager

### Step 4 — Configure kubectl

```bash
make kubeconfig
# Runs: aws eks update-kubeconfig --region ap-southeast-2 --name pingpulse-production
kubectl get nodes  # should show 2 nodes
```

### Step 5 — Initialize databases

```bash
make k8s-db-init
# Fetches DB hosts + passwords from Terraform outputs + Secrets Manager
# Runs init.sql against all 3 RDS instances
```

### Step 6 — Create Kubernetes secrets

```bash
make k8s-secrets
# Fetches all secrets from AWS Secrets Manager
# Creates Kubernetes Secret: pingpulse-secrets
```

### Step 7 — Update ConfigMap with real infrastructure values

```bash
# Get Terraform outputs
make tf-output

# Edit k8s/configmap.yaml — replace REPLACE_WITH_... placeholders:
# REDIS_HOST → Terraform output: redis_endpoint
# AUTH_POSTGRES_HOST → Terraform output: rds_auth_host
# NOTIF_POSTGRES_HOST → Terraform output: rds_notifications_host
# ANALYTICS_POSTGRES_HOST → Terraform output: rds_analytics_host
# SMTP_HOST → your SMTP endpoint (or keep AWS SES default)
```

### Step 8 — Install AWS Load Balancer Controller

```bash
# Get the IAM role ARN for ALB controller (or create it)
# See: https://docs.aws.amazon.com/eks/latest/userguide/aws-load-balancer-controller.html

ALB_ROLE_ARN="arn:aws:iam::<YOUR_AWS_ACCOUNT_ID>:role/AmazonEKSLoadBalancerControllerRole"
make install-alb-controller ALB_ROLE_ARN=$ALB_ROLE_ARN
```

### Step 9 — Set up GitHub Actions for automated CI/CD

In your GitHub repository → Settings → Secrets and Variables → Actions:

| Secret | Value |
|--------|-------|
| `AWS_DEPLOY_ROLE_ARN` | IAM role ARN that GitHub Actions will assume (OIDC) |

Create the IAM role for GitHub Actions OIDC (one-time setup):
```bash
# GitHub's OIDC provider thumbprint
THUMBPRINT="6938fd4d98bab03faadb97b34396831e3780aea1"

# Create OIDC provider for GitHub
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list $THUMBPRINT

# Create deploy role (trust GitHub Actions for your repo)
cat > /tmp/trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::<YOUR_AWS_ACCOUNT_ID>:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:SimanchalaSethi/pingpulse:*"
      }
    }
  }]
}
EOF

aws iam create-role \
  --role-name pingpulse-github-deploy \
  --assume-role-policy-document file:///tmp/trust-policy.json

# Attach required permissions
aws iam attach-role-policy --role-name pingpulse-github-deploy \
  --policy-arn arn:aws:iam::aws:policy/AmazonECRFullAccess
aws iam attach-role-policy --role-name pingpulse-github-deploy \
  --policy-arn arn:aws:iam::aws:policy/AmazonEKSClusterPolicy
```

### Step 10 — First deploy

```bash
# Apply all K8s manifests (deployments, services, ingress, HPA)
make k8s-apply

# Check everything is running
make k8s-status
```

### After setup — all future deploys are automatic

Every `git push` to `main`:
1. GitHub Actions builds all 6 Docker images in parallel
2. Pushes to ECR with the git SHA as tag
3. Runs `kubectl set image` for each deployment
4. Waits for rolling update to complete
5. Reports success/failure

---

## CI/CD Pipeline

```
git push origin main
      │
      ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GitHub Actions — ci.yml (runs on every push + PR)                  │
│                                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  TypeCheck       │  │  Integration     │  │  Docker Build    │  │
│  │  (5 services     │  │  Tests           │  │  (5 services +   │  │
│  │   in parallel)   │  │  (real Postgres  │  │   frontend,      │  │
│  │                  │  │   + Redis in CI) │  │   in parallel)   │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
      │ (on merge to main only)
      ▼
┌─────────────────────────────────────────────────────────────────────┐
│  GitHub Actions — deploy.yml                                         │
│                                                                      │
│  1. AWS OIDC auth (no static credentials stored)                    │
│  2. Build + push all images to ECR (parallel, with layer cache)     │
│     Tags: sha-<gitsha>, latest                                       │
│  3. kubectl set image for each deployment                           │
│  4. Apply service/ingress/HPA manifests                             │
│  5. kubectl rollout status (waits for healthy rollout)              │
│  6. kubectl get pods (final health report)                          │
└─────────────────────────────────────────────────────────────────────┘
```

**Security:**
- GitHub Actions uses OIDC (no static IAM keys stored in secrets)
- K8s Secrets never in CI — fetched from Secrets Manager once manually
- Each service's ECR repo has lifecycle rules (keep last 10 tagged images)
- Docker layer caching across runs (GitHub Actions cache)

---

## Observability — Prometheus + Grafana

### Pre-wired — no configuration needed

Grafana at `http://localhost:3005` (local) automatically has:
- Prometheus datasource connected
- PingPulse Overview dashboard loaded (service health, request rate, error rate, latency, memory)

### Prometheus scrape targets

Every service exposes `/health`. Prometheus scrapes each on port:

| Job | Target | Port |
|-----|--------|------|
| api-gateway | api-gateway:3000 | 3000 |
| auth-service | auth-service:3001 | 3001 |
| notification-service | notification-service:3002 | 3002 |
| delivery-service | delivery-service:3003 | 3003 |
| analytics-service | analytics-service:3004 | 3004 |

### Redis Stream monitoring (key for operations)

```bash
# How many unprocessed messages are waiting? (should be 0 normally)
make redis-pending

# Raw XPENDING
docker exec pp-redis redis-cli XPENDING pp:stream:notifications delivery-workers - + 10

# Consumer group info (see each worker's pending count)
docker exec pp-redis redis-cli XINFO GROUPS pp:stream:notifications

# Stream lengths
make redis-info

# View recent stream entries
docker exec pp-redis redis-cli XRANGE pp:stream:notifications - + COUNT 5
```

### Service logs

```bash
make logs                           # all services
docker compose logs -f api-gateway  # single service
docker compose logs delivery-service 2>&1 | grep ERROR  # errors only
```

---

## Key Design Decisions

### 1. Database per service — no shared schemas

Each of auth, notification, and analytics services has its own PostgreSQL database. There are no cross-database foreign keys or joins.

**Why:** A migration in `notifications_db` cannot break `analytics_db`. Teams can evolve their schema independently. Services can be migrated to different database technologies independently (analytics to Cassandra, auth to DynamoDB) without touching other services.

**Trade-off:** Queries that would be a single JOIN in a monolith require two API calls and application-side joining. Accepted trade-off for the operational independence.

---

### 2. 202 Accepted — async delivery

`POST /notifications` returns HTTP 202 immediately after persisting the notification and publishing to Redis. The client does not wait for delivery.

**Why:** SMTP can take 200ms–2s. Webhook targets can be slow or down. Making delivery synchronous would block the API client for seconds and make the response time dependent on third-party systems. 202 means "received, will process."

**How to know if it succeeded:** Poll `GET /analytics/notifications/:id` or register a delivery webhook.

---

### 3. Redis Streams over REST for fan-out

Delivery is triggered by a Redis Stream event, not by a direct HTTP call from notification-service to delivery-service.

**Why:**
- If delivery-service is down during a traffic spike, messages queue in the stream. When it comes back, it processes the backlog. Direct HTTP would lose the request.
- Stream messages stay in the PEL (Pending Entries List) until ACKed. If a delivery worker crashes mid-processing, the message is reclaimable — at-least-once delivery.
- Delivery workers can be scaled to 20 without changing notification-service.

---

### 4. Consumer groups for delivery workers

Two delivery-service replicas use the same consumer group (`delivery-workers`). Redis guarantees each message goes to exactly one consumer. No duplicate emails.

**At-least-once semantics:** A message is ACKed (`XACK`) only after processing completes. If a worker crashes before ACKing, the message stays in the PEL. Analytics handles duplicates with `ON CONFLICT DO NOTHING`.

**Scaling:** `docker compose up -d --scale delivery-service=5` adds 3 more workers. Redis distributes automatically.

---

### 5. API key design — prefix + hash

Key format: `pp_<16-char-prefix>_<32-char-secret>`

The prefix is stored plaintext for O(1) database lookup. The full key is bcrypt-hashed. On verification:
1. Extract prefix
2. `SELECT * FROM api_keys WHERE key_prefix = $1 AND is_active = true`
3. `bcrypt.compare(incomingKey, storedHash)`

**Why prefix is needed:** Without it, you'd need to bcrypt-compare every active key — O(n) per request. Prefix reduces it to one index lookup + one compare.

Same pattern: GitHub personal access tokens, Linear API keys, HashiCorp Vault tokens.

---

### 6. HMAC-SHA256 webhook signatures

When delivering to a webhook with a configured `signingSecret`:
```
X-Signature: sha256=HMAC-SHA256(signingSecret, rawRequestBody)
```

The receiving server recomputes the signature and compares with `timingSafeEqual` to prevent timing attacks.

Same pattern as Stripe, GitHub, and Twilio. Receiving services can verify the payload is genuine.

---

### 7. Handlebars for templates

Templates use `{{variable}}` syntax. At delivery time: `Handlebars.compile(template)({ ...data })`.

**Why not string interpolation?** Handlebars HTML-escapes all interpolations by default — XSS prevention. No arbitrary code execution (unlike JavaScript template literals). Templates can be stored as text and compiled fresh each delivery without security risk.

---

## Scalability Analysis

### API Gateway

**Bottleneck:** Every request calls auth-service `/internal/validate` — adds ~5ms latency.

**Solution at scale:** Cache validation results in Redis: `SET validate:<token_hash> <workspaceId> EX 60`. One auth-service call per token per minute instead of per request. Throughput: ~500 req/s → ~5000 req/s.

---

### Auth Service

**Bottleneck:** bcrypt login is intentionally slow (12 rounds = ~250ms). Rate-limiting login is mandatory.

Token validation is fast (HMAC verify, no bcrypt). API key verification is one DB index lookup + one bcrypt — acceptable since server-to-server calls are infrequent.

---

### Notification Service

**Bottleneck:** N channel ID validation queries per notification. For a notification to 10 channels: 10 SELECT queries.

**Solution at scale:** Batch validate: `WHERE id = ANY($1)` — one query for all channels.

---

### Delivery Service

**The designed scale-out point.** Add replicas.

- 2 workers: ~200 deliveries/minute (limited by SMTP/webhook latency)
- 10 workers: ~1000 deliveries/minute
- 50 workers: ~5000 deliveries/minute
- Redis consumer groups distribute automatically — no code changes

**Next bottleneck at higher scale:** The `GET /internal/channels/:id` call per delivery. Cache channel configs in memory with a 60-second TTL.

---

### Analytics Service

Pure append writes — easy to scale. Multiple instances in the same consumer group. `ON CONFLICT DO NOTHING` makes it idempotent. Partition `delivery_events` by `created_at` for queries on large datasets.

---

## Production Gaps

What this project doesn't have that a real production system would:

| Gap | What to Add | Why |
|-----|-------------|-----|
| Retry with backoff | Exponential backoff in delivery-service; `XAUTOCLAIM` for stuck messages | Transient SMTP/webhook failures should retry, not permanently fail |
| Dead letter queue | Redis Stream for messages failing after N retries | Prevents one broken message blocking the stream |
| Distributed tracing | OpenTelemetry + Jaeger/XRAY | `trace_id` across 5 services for debugging slow requests |
| TLS in cluster | cert-manager + Let's Encrypt | HTTP inside VPC is OK; external traffic must be HTTPS |
| Secrets rotation | AWS Secrets Manager rotation + Lambda | JWT secret and DB passwords need periodic rotation |
| Row-level security | PostgreSQL RLS | Workspace A must never see Workspace B's data even with a bug |
| Idempotency keys | `Idempotency-Key` header on `POST /notifications` | Client retry on network failure must not create duplicate notifications |
| SMS channel | Twilio SDK in a new `SmsChannel.ts` | Third delivery channel — delivery-service is designed to extend |
| Token refresh | `/auth/refresh` endpoint | 7-day JWT expiry is too long for production |
| Per-workspace rate limits | Read limit from DB per workspace | Enterprise customers need higher limits than free tier |
| Multi-region | Route53 + cross-region replication | Single-region is a SPOF |
| Load testing | k6 scripts | Validate delivery throughput before production traffic |
| Alerting rules | Prometheus alerting rules + PagerDuty | Page on delivery rate drop or stream backlog growth |

---

## Interview Q&A

These are the questions engineering interviewers ask about this type of system.

---

**Q: Why microservices instead of a monolith?**

The primary driver is **independent scaling**. Delivery is IO-bound (SMTP takes 200ms–2s), and it's the bottleneck. In a monolith, the entire application scales together even if only delivery needs more capacity. With microservices, I add delivery workers and nothing else changes.

The second driver is **independent failure**. If analytics-service crashes, notifications still deliver — delivery events queue in the stream and get consumed when analytics comes back up. In a monolith, a bug in the metrics code crashing the process would stop all delivery.

---

**Q: How do you guarantee exactly-once delivery?**

I don't — the system provides **at-least-once delivery** with idempotency guards.

Redis consumer groups guarantee each message goes to one consumer at a time. But if a worker processes a message and crashes before ACKing, the message stays in the PEL and gets redelivered when another worker claims it.

The analytics service handles this with `ON CONFLICT (id) DO NOTHING`. For email — receiving two "payment failed" emails is better than receiving none.

---

**Q: What happens if delivery-service is down for an hour?**

Messages accumulate in `pp:stream:notifications`. Redis Streams are persistent (append-only log, written to disk with `appendonly yes`). When delivery-service comes back up, it reads from `>` (new messages) but there's also a pending messages recovery path.

Monitoring metric: `XPENDING` count. If growing, workers are falling behind.

---

**Q: How does the API gateway authenticate without holding the JWT secret?**

It doesn't hold the secret. On every authenticated request, it calls `GET http://auth-service:3001/internal/validate`. Auth-service verifies the JWT signature using its own `JWT_SECRET` and returns the claims.

`JWT_SECRET` lives only in auth-service. To rotate it, restart auth-service — zero changes elsewhere.

**Follow-up: "Isn't that a latency hit?"** — Yes, ~5ms per request. Solution: cache the validation result in Redis with a 60s TTL keyed by token hash. After the first validation, subsequent requests for the same token hit Redis in <1ms.

---

**Q: How would you add an SMS channel?**

Three changes, all in delivery-service:

1. Create `SmsChannel.ts` — implements `deliver(channelId, notificationId, data)` using the Twilio SDK
2. Add `else if (channel.type === 'sms') { await smsChannel.deliver(...) }` to the fan-out block
3. Add Twilio credentials to delivery-service environment variables

Notification-service doesn't change. The channel `config` JSONB column already accepts any structure — `{ "to": "+61412345678" }` fits naturally.

This is why the polymorphic channel interface exists — new channel types cost one file and one if-branch.

---

**Q: Why Redis Streams and not Kafka?**

Kafka adds significant operational complexity: ZooKeeper or KRaft, partition management, consumer offset management, replication factor decisions. For the volume this service handles (<10k notifications/day), Redis Streams provides the same guarantees — consumer groups, at-least-once, persistent log — while running on the same Redis instance already used for rate limiting.

If the system needed >1M events/day, guaranteed multi-region durability, or long-term event retention for replay/audit, Kafka would be the right answer.

---

**Q: How does the rate limiter work?**

Sliding window algorithm in Redis:

```
For each request from workspaceId:
  key = "ratelimit:<workspaceId>"
  ZADD key <now_ms> <requestId>          ← record this request
  ZREMRANGEBYSCORE key 0 <now_ms - 60000> ← remove entries older than 1 minute
  count = ZCARD key                       ← count requests in the window
  EXPIRE key 61                           ← auto-cleanup
  if count > 300: return 429
```

This is a true sliding window — not a fixed-minute bucket. A workspace can't get 600 requests by straddling a minute boundary.

---

**Q: Why 202 Accepted instead of 200 OK?**

202 is semantically correct — "the request has been accepted for processing, but the processing has not been completed." Returning 200 would imply delivery succeeded, which isn't true.

From a client perspective, 202 means "poll for status or set up a delivery webhook." Same pattern as AWS SQS, Stripe payment intents, and most async APIs.

---

**Q: Walk me through database-per-service — what's the real cost?**

The cost is **no cross-service joins**. In a monolith, `SELECT n.*, d.status FROM notifications n JOIN delivery_events d ON d.notification_id = n.id` is trivial. Here, analytics-service only stores delivery events — it doesn't have the full notification row. A query like "show me all failed notifications with their channel names" requires fetching from both notification-service and analytics-service at the application layer and joining in code.

The benefit is that notification-service can change its schema, run migrations, or even switch databases without affecting analytics-service. Each team owns their service end-to-end.

For this type of system — high write throughput, few cross-entity queries in the hot path — the trade-off is worth it.

---

*Built with Node.js · TypeScript · Redis · PostgreSQL · Docker · Terraform · Kubernetes*
