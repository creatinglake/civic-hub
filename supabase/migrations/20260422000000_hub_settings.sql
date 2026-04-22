-- =====================================================================
-- Migration 004 — hub_settings key-value table
-- =====================================================================
-- Generic key-value store for admin-configurable hub settings that shouldn't
-- live in env vars because admins should be able to change them from the UI
-- without a redeploy.
--
-- First use: brief_recipient_emails — the comma-separated list of addresses
-- Civic Briefs are delivered to on admin approval. Falls back to the
-- BOARD_RECIPIENT_EMAIL env var when the row doesn't exist yet, so existing
-- deploys keep working without a manual insert.
--
-- Writes go through the backend service role only. RLS is on with no
-- permissive policies, matching the project convention.
-- =====================================================================

CREATE TABLE hub_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

ALTER TABLE hub_settings ENABLE ROW LEVEL SECURITY;
-- no permissive policies → service role only.

-- Keep updated_at current on every row write.
CREATE OR REPLACE FUNCTION hub_settings_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hub_settings_touch_updated_at
  BEFORE INSERT OR UPDATE ON hub_settings
  FOR EACH ROW
  EXECUTE FUNCTION hub_settings_touch_updated_at();
