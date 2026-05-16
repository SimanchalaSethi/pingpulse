-- analytics-service owns this table. It's append-only — events are never updated.
-- Populated by consuming the delivery events Redis Stream.

CREATE TABLE IF NOT EXISTS delivery_events (
  id              UUID PRIMARY KEY,
  notification_id UUID NOT NULL,
  workspace_id    UUID NOT NULL,
  channel_id      UUID NOT NULL,
  channel_type    TEXT NOT NULL,
  status          TEXT NOT NULL CHECK (status IN ('delivered', 'failed')),
  status_code     INTEGER,
  error_message   TEXT,
  attempt_number  SMALLINT NOT NULL DEFAULT 1,
  duration_ms     INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Time-series queries (delivery rate over time)
CREATE INDEX IF NOT EXISTS idx_delivery_events_workspace_time
  ON delivery_events (workspace_id, created_at DESC);

-- Per-notification breakdown
CREATE INDEX IF NOT EXISTS idx_delivery_events_notification
  ON delivery_events (notification_id);

-- Channel-type analytics
CREATE INDEX IF NOT EXISTS idx_delivery_events_channel_type
  ON delivery_events (workspace_id, channel_type);
