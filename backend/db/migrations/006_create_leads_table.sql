CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT,
  full_name TEXT,
  company_name TEXT,
  email TEXT UNIQUE,
  phone TEXT,
  website_url TEXT,
  industry TEXT,
  required_services TEXT[] DEFAULT '{}',
  lead_score TEXT DEFAULT 'Cold',
  status TEXT DEFAULT 'open',
  assigned_to TEXT,
  follow_up_date TIMESTAMPTZ,
  conversation_history JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_email_idx ON leads (LOWER(email));
