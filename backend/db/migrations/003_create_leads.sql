CREATE TABLE IF NOT EXISTS leads (
  id BIGSERIAL PRIMARY KEY,
  session_id TEXT REFERENCES conversations(session_id),
  full_name TEXT,
  company_name TEXT,
  email TEXT,
  phone TEXT,
  website_url TEXT,
  industry TEXT,
  required_services TEXT[] NOT NULL DEFAULT '{}',
  lead_score TEXT NOT NULL DEFAULT 'Cold',
  status TEXT NOT NULL DEFAULT 'new',
  assigned_to TEXT,
  follow_up_date TIMESTAMPTZ,
  conversation_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS leads_email_unique_idx ON leads (lower(email)) WHERE email IS NOT NULL;
