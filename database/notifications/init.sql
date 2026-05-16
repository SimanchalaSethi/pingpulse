-- notification-service owns these tables.
-- workspace_id is the only cross-service reference (denormalized, no FK to auth DB).

CREATE TABLE IF NOT EXISTS notifications (
  id           UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  type         TEXT NOT NULL,
  template_id  UUID,
  data         JSONB NOT NULL DEFAULT '{}',
  status       TEXT NOT NULL DEFAULT 'queued'
               CHECK (status IN ('queued','processing','delivered','failed','partial')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_workspace ON notifications (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_status    ON notifications (workspace_id, status);

CREATE TABLE IF NOT EXISTS channels (
  id           UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('email', 'webhook', 'sms')),
  name         TEXT NOT NULL,
  config       JSONB NOT NULL,
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_workspace ON channels (workspace_id);

CREATE TABLE IF NOT EXISTS deliveries (
  id              UUID PRIMARY KEY,
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  channel_id      UUID NOT NULL REFERENCES channels(id),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','delivered','failed','retrying')),
  attempt_count   SMALLINT NOT NULL DEFAULT 0,
  last_error      TEXT,
  delivered_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deliveries_notification ON deliveries (notification_id);

CREATE TABLE IF NOT EXISTS templates (
  id           UUID PRIMARY KEY,
  workspace_id UUID NOT NULL,
  name         TEXT NOT NULL,
  subject      TEXT,
  body         TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_workspace ON templates (workspace_id);
