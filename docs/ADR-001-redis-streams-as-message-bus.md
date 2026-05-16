# ADR-001: Redis Streams as the Inter-Service Message Bus

**Status:** Accepted  
**Date:** 2024-04-28  
**Deciders:** Simanchala Sethi

---

## Context

PingPulse routes notification events from the notification-service to the delivery-service and then to the analytics-service. We needed an async message bus that:

1. Guarantees at-least-once delivery (no fire-and-forget)
2. Supports multiple independent consumers (delivery + analytics read from the same stream)
3. Can be run locally without a separate broker cluster
4. Has idiomatic Node.js client support

## Options Considered

| Option | Pros | Cons |
|---|---|---|
| **Redis Streams** | Built into Redis (already a hard dep for rate limiting), consumer groups, persistent log, ack-based delivery | Not a full broker — no dead-letter queue, no schema registry |
| RabbitMQ | Mature, flexible routing, DLQ built-in | Adds another infra dependency; operational overhead |
| Kafka | High-throughput, replay, schema registry | Major infra overhead; overkill for this scale |
| HTTP (sync) | Simple | Creates tight coupling, cascading failures if delivery-service is down |
| BullMQ (Redis-backed) | Job queue semantics, retries | Adds a library abstraction layer; streams are more primitive/flexible |

## Decision

Use **Redis Streams with consumer groups**.

- `notifications:created` stream — notification-service publishes; delivery-service consumes
- `delivery:completed` stream — delivery-service publishes; analytics-service consumes
- Each consumer group uses `XREADGROUP` + `XACK` for at-least-once semantics
- Pending Entry List (PEL) allows recovery of unacknowledged messages after crash

## Consequences

**Positive**
- Zero additional infrastructure: Redis is already required for rate limiting
- Consumer groups provide exactly the fan-out pattern we need
- Message log is persistent (configurable `MAXLEN`) and replayable for debugging

**Negative**
- No dead-letter queue — failed messages after max retries are currently dropped (logged)
- No schema registry — stream payload shape is enforced only by TypeScript types in `/shared`
- Scaling beyond ~50k msg/s would require migrating to Kafka or a managed queue (SQS, Pub/Sub)

## Follow-up

- [ ] ADR-002: Dead Letter Queue strategy (manual replay vs. separate stream)
- [ ] Add `MAXLEN` trimming config to `docker-compose.yml` and Helm values
