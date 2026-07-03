-- Comment identity — real name by default, opt-in anonymity.
--
--   is_anonymous — resident chose to post this comment anonymously.
--                  author_id is still stored (moderation accountability);
--                  anonymity is display-level only.
--   author_name  — snapshot of the author's real name at post time, so
--                  later name edits don't rewrite the public record.
--                  NULL for anonymous comments and for legacy rows that
--                  pre-date the required-name policy (rendered as
--                  "Resident" in the UI).
ALTER TABLE community_inputs ADD COLUMN IF NOT EXISTS is_anonymous BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE community_inputs ADD COLUMN IF NOT EXISTS author_name TEXT;
