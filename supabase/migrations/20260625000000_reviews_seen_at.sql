-- =====================================================================
-- Notification "seen" marker for the review system
-- =====================================================================
-- Drives the attention indicator on the account menu. The badge counts
-- reviews updated since the user last looked at their submissions
-- (residents) or the review queue (admins). Opening that page stamps
-- reviews_seen_at = now(), which clears the badge regardless of whether
-- the user acted — so notifications never accumulate.
-- =====================================================================

ALTER TABLE users ADD COLUMN IF NOT EXISTS reviews_seen_at TIMESTAMPTZ;
