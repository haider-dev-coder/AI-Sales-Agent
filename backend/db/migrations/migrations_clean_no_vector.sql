-- ============================================================
-- MASTER MIGRATION — no pgvector required
-- Embeddings stored in-memory (InMemoryRetriever), not in DB
-- ============================================================

-- 1. knowledge_chunks (no vector column)
CREATE TABLE IF NOT EXISTS knowledge_chunks (
  id          BIGSERIAL   PRIMARY KEY,
  url         TEXT        NOT NULL,
  page_type   TEXT        NOT NULL,
  page_title  TEXT,
  chunk_index INTEGER     NOT NULL,
  chunk_text  TEXT        NOT NULL,
  crawled_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (url, chunk_index)
);
CREATE INDEX IF NOT EXISTS knowledge_chunks_page_type_idx
  ON knowledge_chunks (page_type);

-- 2. conversations
CREATE TABLE IF NOT EXISTS conversations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  TEXT        UNIQUE NOT NULL,
  messages    JSONB       NOT NULL DEFAULT '[]'::jsonb,
  lead_data   JSONB       NOT NULL DEFAULT '{}'::jsonb,
  lead_score  TEXT,
  status      TEXT        NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. leads
CREATE TABLE IF NOT EXISTS leads (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id           TEXT,
  full_name            TEXT,
  company_name         TEXT,
  email                TEXT,
  phone                TEXT,
  website_url          TEXT,
  industry             TEXT,
  required_services    TEXT[]      NOT NULL DEFAULT '{}',
  lead_score           TEXT        NOT NULL DEFAULT 'Cold',
  status               TEXT        NOT NULL DEFAULT 'new',
  assigned_to          TEXT,
  follow_up_date       TIMESTAMPTZ,
  conversation_history JSONB       NOT NULL DEFAULT '[]'::jsonb,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS leads_email_unique_idx
  ON leads (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS leads_status_idx ON leads (status);
CREATE INDEX IF NOT EXISTS leads_score_idx  ON leads (lead_score);

-- 4. email_logs
CREATE TABLE IF NOT EXISTS email_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_name TEXT        NOT NULL,
  recipient    TEXT        NOT NULL,
  subject      TEXT        NOT NULL,
  status       TEXT        NOT NULL,
  attempts     INTEGER     NOT NULL DEFAULT 0,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. analytics_events
CREATE TABLE IF NOT EXISTS analytics_events (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id  TEXT,
  event_type  TEXT        NOT NULL,
  payload     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_events_type_time_idx
  ON analytics_events (event_type, created_at);

-- 6. faqs
CREATE TABLE IF NOT EXISTS faqs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  question     TEXT        NOT NULL,
  answer       TEXT,
  frequency    INTEGER     NOT NULL DEFAULT 1,
  last_asked   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. sales_reps
CREATE TABLE IF NOT EXISTS sales_reps (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT        NOT NULL,
  email      TEXT        UNIQUE NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. follow_ups
CREATE TABLE IF NOT EXISTS follow_ups (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id      UUID        REFERENCES leads(id) ON DELETE CASCADE,
  rep_id       UUID        REFERENCES sales_reps(id),
  scheduled_at TIMESTAMPTZ NOT NULL,
  notes        TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS follow_ups_lead_idx      ON follow_ups (lead_id);
CREATE INDEX IF NOT EXISTS follow_ups_scheduled_idx ON follow_ups (scheduled_at);
