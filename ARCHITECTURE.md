# Architecture Deep Dive

---

## 1. The Microservice Boundaries

Each service is defined by what it **owns**, not what it does:

| Service | Owns | Doesn't know about |
|---------|------|--------------------|
| auth-service | users, workspaces, API keys, JWT secrets | notifications, channels, analytics |
| notification-service | notifications, channels, templates, delivery status | who the user is (only workspace ID) |
| delivery-service | in-flight delivery state | where data came from, who triggered it |
| analytics-service | historical delivery events, aggregated stats | how notifications were created |
| api-gateway | routing rules, rate limit counters | any business logic |

No service holds a reference to another service's database. Cross-service data flows through:
1. REST calls to defined endpoints (sync, when you need a response immediately)
2. Redis Stream events (async, when you don't)

---

## 2. Communication Patterns

### Synchronous REST (request/response)

**When:** The caller needs data from the response before it can continue.

Examples:
- API Gateway → auth-service: "Is this JWT valid?" — gateway blocks until it knows
- delivery-service → notification-service: "What is the config for channel X?" — can't deliver without it

```
Gateway                auth-service
   │──── POST /internal/validate ────►│
   │◄─── { userId, workspaceId } ─────│
   │
   │  (now adds headers, forwards to downstream service)
```

### Asynchronous Redis Streams (fire and forget)

**When:** The caller doesn't need to wait for the result. Delivery should happen even if the consumer is temporarily down.

```
notification-service                Redis Stream              delivery-service (2 workers)
      │── XADD pp:stream:notifications * ... ──►│
      │                                          │◄── XREADGROUP (worker 1 picks up) ──
      │                                          │◄── XREADGROUP (worker 2 blocked) ──
      │
      │  (returns 202 Accepted to client immediately)
```

**Why Redis Streams over Redis Pub/Sub?**
Pub/Sub is ephemeral — if a subscriber is offline, messages are lost. Streams persist messages until acknowledged. Consumer groups let multiple workers share the load and guarantee each message is processed exactly once per group.

---

## 3. Database-Per-Service Pattern

Each service has its own PostgreSQL instance with a completely independent schema. This is the canonical microservices database pattern — it enforces service autonomy.

```
auth-service        notification-service     analytics-service
     │                       │                       │
     ▼                       ▼                       ▼
┌──────────┐         ┌──────────────┐         ┌──────────────┐
│ auth_db  │         │notifications │         │ analytics_db │
│          │         │     _db      │         │              │
│ users    │         │              │         │delivery_     │
│ workspaces│        │ notifications│         │events        │
│ api_keys │         │ channels     │         └──────────────┘
└──────────┘         │ deliveries   │
                     │ templates    │
                     └──────────────┘
```

**No foreign keys across services.** analytics-service stores `workspace_id` and `notification_id` as plain UUID columns — not FK references to other databases. This is intentional: the data is denormalized by design.

**The tradeoff:** You can't do a JOIN across services. Queries that span multiple services require either:
- An aggregation service that calls multiple services
- Denormalized data at write time (what analytics-service does — it stores everything it needs)

---

## 4. API Gateway as Cross-Cutting Concerns Layer

The gateway does three things and nothing else:
1. **Authentication** — validates credentials by calling auth-service
2. **Rate limiting** — per-workspace, backed by Redis
3. **Routing** — reverse proxies requests to the right downstream service

It never holds business logic. It never talks to a database directly.

```typescript
// Gateway auth: fail closed — if auth-service is unreachable, deny access
try {
  const response = await axios.post(`${AUTH_SERVICE_URL}/internal/validate`, ...);
  // inject identity as headers so downstream services don't need to re-validate
  req.headers['x-user-id'] = response.data.data.userId;
  req.headers['x-workspace-id'] = response.data.data.workspaceId;
} catch {
  // auth-service down → deny (fail closed, not open)
  return res.status(503).json({ error: 'Authentication service unavailable' });
}
```

**Why forward identity as headers?**
Downstream services trust the gateway completely (internal network). Once the gateway validates identity, downstream services just read `x-workspace-id` from the header — no need to re-validate every request. This is called the "sidecar trust" pattern.

---

## 5. Fan-Out Pattern in Delivery Service

When a notification arrives in the stream with 3 channel IDs, delivery-service delivers to all 3 concurrently:

```typescript
await Promise.allSettled(
  event.channels.map((channelId) => deliverToChannel(channelId, event))
);
```

`Promise.allSettled` (not `Promise.all`) is critical: if email delivery fails, webhook delivery still succeeds. Each channel is independent. The result of each delivery is published as a separate event to the analytics stream regardless of outcome.

---

## 6. Consumer Groups — Horizontal Scaling of Delivery

```
pp:stream:notifications (Redis Stream)
         │
         │  XREADGROUP GROUP delivery-workers
         │
    ┌────┴────────────────────────────────────┐
    │                                         │
delivery-worker-1              delivery-worker-2
(handles message A)            (handles message B)
         │                                   │
         └── XACK (message A processed) ──  └── XACK (message B processed)
```

Two workers consume from the same stream. Redis guarantees message A goes to exactly one worker. To scale up to handle more load:

```bash
docker compose up -d --scale delivery-service=10
```

All 10 workers form the same consumer group — Redis distributes messages automatically. No changes to notification-service, analytics-service, or any other component.

---

## 7. HMAC Webhook Signatures

Webhook channel delivery includes a signature so receivers can verify payloads are genuine:

```typescript
const sig = crypto.createHmac('sha256', config.signingSecret).update(body).digest('hex');
headers['X-PingPulse-Signature'] = `sha256=${sig}`;
```

The receiver can verify:
```typescript
const expected = crypto.createHmac('sha256', mySecret).update(rawBody).digest('hex');
const received = req.headers['x-pingpulse-signature'].replace('sha256=', '');
if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received))) {
  return res.status(401).send('Invalid signature');
}
```

`timingSafeEqual` prevents timing attacks on the comparison. This is the same pattern Stripe and GitHub use.

---

## 8. Scalability Characteristics

| Service | Bottleneck | Scale approach |
|---------|-----------|----------------|
| api-gateway | CPU (proxy overhead) | Stateless — scale horizontally |
| auth-service | DB reads (token validation) | Redis cache for validated tokens |
| notification-service | DB writes + Redis publish | Stateless — scale horizontally |
| delivery-service | External service latency | Consumer group — add replicas |
| analytics-service | DB writes (high volume) | Batch inserts, partitioned by workspace |

---

## 9. What This Doesn't Include (and Why)

| Feature | Reason not included |
|---------|-------------------|
| Service mesh (Istio/Linkerd) | Adds significant operational overhead. The sidecar pattern via header injection is sufficient for most teams. |
| gRPC between services | REST is simpler for this problem size. gRPC benefits appear at >1000 RPS inter-service. |
| Distributed tracing | The plumbing (OpenTelemetry) is straightforward to add — intentionally left as a contribution opportunity. |
| Dead letter queue for failed deliveries | Retry logic in delivery-service is left as an exercise — the Redis Stream provides the backpressure mechanism needed. |
| Circuit breaker | express-rate-limit + timeout on axios calls provide basic circuit breaking. A full circuit breaker (like `opossum`) would be the next step. |
