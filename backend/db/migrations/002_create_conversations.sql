CREATE TABLE IF NOT EXISTS conversations (
  session_id TEXT PRIMARY KEY,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  lead_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  lead_score TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
