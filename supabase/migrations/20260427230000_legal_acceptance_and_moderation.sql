-- =====================================================================
-- Slice 11 — Legal acceptance + minimal moderation
-- =====================================================================
-- Adds:
--   1. users.tos_version_accepted, users.tos_accepted_at — track each
--      user's most recent legal-document acceptance. Existing rows have
--      NULL until next sign-in triggers the re-acceptance modal.
--   2. community_inputs.hidden_at, hidden_by, hidden_reason, restored_at
--      — moderation columns for the "hide a comment" admin tooling. The
--      original body stays in the row so admins can review the decision
--      and restore. Public read-models redact body for hidden rows.
--
-- Announcement moderation does NOT need a column — it lives inside the
-- existing processes.state JSONB field as state.moderation. Migrations
-- are not required for additive optional JSON fields, but the shape is
-- documented in civic-hub/src/modules/civic.announcement/models.ts.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Track legal-document acceptance per user.
-- ---------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS tos_version_accepted TEXT,
  ADD COLUMN IF NOT EXISTS tos_accepted_at      TIMESTAMPTZ;

COMMENT ON COLUMN users.tos_version_accepted IS
  'Most recent legal-document version the user accepted (e.g. "1.0"). NULL means never accepted; the UI prompts re-acceptance until set.';

-- ---------------------------------------------------------------------
-- Comment moderation: append-only audit columns on community_inputs.
-- ---------------------------------------------------------------------
-- A hidden comment retains its original body so admins can review the
-- decision and restore. Public read-models redact body to a tombstone.
-- restored_at is set when an admin reverses the hide; once set, the
-- comment is treated as visible again. Re-hiding overwrites these
-- columns (single most-recent-action shape; full history lives in the
-- events table via civic.process.updated audit events).
-- ---------------------------------------------------------------------
ALTER TABLE community_inputs
  ADD COLUMN IF NOT EXISTS hidden_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS hidden_by      TEXT,
  ADD COLUMN IF NOT EXISTS hidden_reason  TEXT,
  ADD COLUMN IF NOT EXISTS restored_at    TIMESTAMPTZ;

COMMENT ON COLUMN community_inputs.hidden_at IS
  'When this comment was hidden by a moderator. NULL = visible. If restored_at > hidden_at the comment is visible again.';
