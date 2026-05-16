# Contributing to PingPulse

## Development Setup

```bash
git clone https://github.com/SimanchalaSethi/pingpulse.git
cd pingpulse
npm install

# Start infrastructure
docker compose up -d redis postgres-auth postgres-notifications postgres-analytics mailhog

cp .env.example .env

# Start all services (hot reload)
npm run dev
```

Services run at:
- API Gateway: http://localhost:3000
- auth-service: http://localhost:3001
- notification-service: http://localhost:3002
- delivery-service: http://localhost:3003
- analytics-service: http://localhost:3004
- Mailhog (email UI): http://localhost:8025

---

## Project Structure

```
pingpulse/
├── shared/                    ← TypeScript types + Redis event contracts
├── services/
│   ├── api-gateway/           ← Single entry point, auth, rate limiting
│   ├── auth-service/          ← Users, JWT, API keys
│   ├── notification-service/  ← Core business logic, channels, templates
│   ├── delivery-service/      ← Redis consumer, email + webhook delivery
│   └── analytics-service/     ← Delivery event consumer, stats API
├── frontend/                  ← React dashboard
├── database/                  ← SQL migration files per service
├── k8s/                       ← Kubernetes manifests
└── infrastructure/terraform/  ← AWS infrastructure (EKS, RDS, ElastiCache)
```

---

## Adding a New Channel Type

1. Add `'sms'` or `'push'` to `ChannelType` in `shared/src/types/index.ts`
2. Create `services/delivery-service/src/channels/SmsChannel.ts`
3. Register the handler in `delivery-service/src/index.ts` `processNotification()`
4. Add config validation in `notification-service/src/routes/channels.ts`
5. Update `database/notifications/init.sql` channel type CHECK constraint
6. Add tests
7. Document in README

---

## Code Standards

- **TypeScript strict mode** — no `any`, no unused vars
- **Conventional commits**: `feat:`, `fix:`, `ci:`, `docs:`, `refactor:`
- **No shared database** — services must only read/write their own DB
- **No direct service-to-service DB access** — call the owning service's API
- **Tests required** for new features

---

## Contribution Areas

High-value contributions:
- **SMS channel** (Twilio SDK integration in delivery-service)
- **Push notifications** (Firebase FCM)
- **Retry with exponential backoff** in delivery-service
- **OpenTelemetry tracing** — add spans across all services
- **Per-workspace retry policies** stored in notification-service
- **Circuit breaker** on delivery-service channel adapters

---

## Questions?

Open a GitHub Discussion or file an issue.
