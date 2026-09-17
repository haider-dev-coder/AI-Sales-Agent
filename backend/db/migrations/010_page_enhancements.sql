-- ============================================================
-- 010 — Page enhancements for FAQs / Knowledge Base / Settings
-- Additive columns only. Re-runnable via ADD COLUMN IF NOT EXISTS.
-- ============================================================

-- faqs: add category + active flag used by the FAQs page
ALTER TABLE faqs ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'General';
ALTER TABLE faqs ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

-- knowledge_chunks: add a status column used by the Knowledge Base page
ALTER TABLE knowledge_chunks ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'indexed';

-- app_settings: key/value JSON settings persisted by the Settings page
CREATE TABLE IF NOT EXISTS app_settings (
  key         TEXT        PRIMARY KEY,
  value       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
