CREATE TABLE IF NOT EXISTS crawl_jobs (
  job_id TEXT PRIMARY KEY,
  website_url TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  progress INTEGER NOT NULL DEFAULT 0,
  pages_found INTEGER NOT NULL DEFAULT 0,
  errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS crawl_jobs_created_at_idx ON crawl_jobs (created_at DESC);
