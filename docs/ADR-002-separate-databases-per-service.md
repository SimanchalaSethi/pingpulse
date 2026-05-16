# ADR-002: Separate PostgreSQL Database Per Service

**Status:** Accepted  
**Date:** 2024-04-28  
**Deciders:** Simanchala Sethi

---

## Context

PingPulse has three services that need persistent storage: auth-service, notification-service, and analytics-service. We had to decide whether to share a single PostgreSQL instance and schema, or give each service its own isolated database.

## Options Considered

| Option | Pros | Cons |
|---|---|---|
| **Separate DB per service** | True bounded context isolation, independent schema evolution, service can migrate without coordination | More infra to run locally and in prod; cross-service queries impossible |
| Shared DB, separate schemas | Easier to run; allows JOIN queries | Schema changes risk breaking other services; violates bounded context |
| Shared DB, shared schema | Simplest setup | Tight coupling; one bad migration can take down all services |

## Decision

**Separate PostgreSQL database per service** — one for auth, one for notifications, one for analytics.

In `docker-compose.yml` this means three separate `postgres` containers. In AWS (Terraform), it means three separate RDS instances (or three databases on one Multi-AZ instance with separate credentials per service — acceptable trade-off in cost vs. isolation).

Cross-service data needs (e.g., analytics needs notification IDs) are passed via events on Redis Streams, not direct DB access.

## Consequences

**Positive**
- A schema migration in auth-service has zero risk to notification-service
- Each service can be scaled, backed up, and restored independently
- Enforces the event-driven contract — no service bypasses the bus to read another's DB

**Negative**
- Local dev requires `docker compose up` with three Postgres containers (mitigated by the Makefile target)
- Cannot JOIN across service boundaries — aggregation must happen at the application layer or via the analytics stream
- Three RDS instances in prod = ~3x the DB cost (mitigated by using db.t3.micro for non-analytics)

## Follow-up

- [ ] Evaluate using a single RDS instance with three logical databases once cost data is available in production
