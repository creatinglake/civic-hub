-- =====================================================================
-- Migration 005 — digest subscription columns on users
-- =====================================================================
-- Slice 5: daily email digest of new civic activity. Users are opt-out —
-- new accounts are enrolled on creation, existing users are enrolled
-- retroactively via this migration's default, and anyone can unsubscribe
-- via a signed link in every digest email or via the UI settings page.
--
-- `last_digest_sent_at` tracks the "since" cursor for each user's next
-- digest. NULL means "never sent" — the cron uses the user's created_at
-- as the since anchor in that case, capped to 30 days ago so dormant
-- users don't get a gigantic first digest.
-- =====================================================================

ALTER TABLE users
  ADD COLUMN digest_subscribed    BOOLEAN     NOT NULL DEFAULT TRUE,
  ADD COLUMN last_digest_sent_at  TIMESTAMPTZ;

-- Existing rows pick up the DEFAULT automatically; this UPDATE is a
-- belt-and-suspenders clarification that retroactive enrollment is
-- intentional.
UPDATE users SET digest_subscribed = TRUE WHERE digest_subscribed IS NULL;

-- Partial index — the cron iterates the subscribed set; skipping the
-- unsubscribed rows keeps the scan cheap as the user count grows.
CREATE INDEX users_digest_subscribed_idx
  ON users (digest_subscribed)
  WHERE digest_subscribed = TRUE;
