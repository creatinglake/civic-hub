-- Replace boolean digest_subscribed with integer digest_frequency_days.
--
-- null          = unsubscribed
-- 1             = daily (default for new users, same as old digest_subscribed=true)
-- 3, 7, 14, 30 = every N days
--
-- Existing subscribed users → 1 (daily). Unsubscribed → null.

ALTER TABLE users ADD COLUMN digest_frequency_days INTEGER;

UPDATE users
SET digest_frequency_days = CASE
  WHEN digest_subscribed = true THEN 1
  ELSE NULL
END;

ALTER TABLE users DROP COLUMN digest_subscribed;

-- Partial index — the cron iterates users with a non-null frequency;
-- skipping unsubscribed rows keeps the scan cheap.
CREATE INDEX users_digest_frequency_idx
  ON users (digest_frequency_days)
  WHERE digest_frequency_days IS NOT NULL;
