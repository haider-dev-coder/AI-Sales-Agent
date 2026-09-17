-- ============================================================
-- 011 — Appointments (Cal.com bookings) + analytics_events guard
-- Re-runnable: CREATE TABLE / CREATE INDEX IF NOT EXISTS.
-- ============================================================

-- The ORM (app.database.models.Appointment) references this table but the
-- local database never had it created, which made /api/analytics/overview and
-- /api/dashboard/overview report a false 0 for booked meetings.
CREATE TABLE IF NOT EXISTS appointments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id           UUID,
  conversation_id   UUID,
  calcom_booking_id TEXT,
  event_type        TEXT,
  start_time        TIMESTAMPTZ,
  end_time          TIMESTAMPTZ,
  status            TEXT NOT NULL DEFAULT 'pending',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS appointments_lead_idx ON appointments (lead_id);
CREATE INDEX IF NOT EXISTS appointments_conversation_idx ON appointments (conversation_id);
CREATE INDEX IF NOT EXISTS appointments_created_idx ON appointments (created_at DESC);

-- analytics_events is the primary source for the Recent Activity panel.
CREATE TABLE IF NOT EXISTS analytics_events (
  id         BIGSERIAL PRIMARY KEY,
  session_id TEXT,
  event_type TEXT NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS analytics_events_type_time_idx ON analytics_events (event_type, created_at);
