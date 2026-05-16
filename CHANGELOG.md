# Changelog

All notable changes to PingPulse are documented here.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2024-04-29

### Added

**Platform**
- Event-driven microservices architecture with 5 independent services
- Redis Streams as the message bus (consumer groups, at-least-once delivery)
- JWT-based authentication with API key management (per-key rate limiting)
- Multi-channel notification delivery: email (SMTP/Mailhog) and webhook (HTTPS)
- Exponential backoff retry logic in the delivery service (3 attempts, 1s/2s/4s)
- Template engine with Handlebars-compatible variable substitution
- Soft-delete for notifications and channels (audit trail preserved)

**Observability**
- Prometheus metrics on every service (`/metrics` endpoint)
- Pre-built Grafana dashboard: throughput, latency p50/p95/p99, error rates, queue depth
- Structured JSON logging with correlation IDs across service boundaries

**Infrastructure**
- `docker-compose.yml` — single-command local development with all backing services
- Kubernetes manifests for all 6 deployments (services + frontend)
- HPA on delivery-service (scale 2→10 on CPU 60%)
- Terraform modules: VPC, EKS, RDS (Multi-AZ), ElastiCache, ECR
- GitHub Actions CI: TypeCheck → Integration Tests → Docker Build (parallel matrix)
- GitHub Actions CD: Build → Push ECR → Rolling deploy to EKS on main merge

**Frontend**
- React + TypeScript + Vite dashboard
- Pages: Dashboard, Notifications, Channels, Templates, API Keys, Analytics
- JWT auth flow (login/register, token refresh, protected routes)

**Database**
- Separate PostgreSQL databases per bounded context (auth, notifications, analytics)
- Migration-ready `init.sql` schemas with indexes on all foreign keys and status columns
- `analytics_events` table with composite index on `(notification_id, created_at)`

---

## [Unreleased]

### Planned
- SMS channel via Twilio
- Push notifications via FCM/APNs
- OpenTelemetry distributed tracing (replace manual correlation IDs)
- Webhook signature verification (HMAC-SHA256)
- Admin UI for user management
- Dead Letter Queue (DLQ) with manual replay
