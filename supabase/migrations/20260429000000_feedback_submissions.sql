-- =====================================================================
-- Slice 14 — feedback_submissions table
-- =====================================================================
-- Captures user-submitted product feedback (ideas, bug reports,
-- moderation suggestions, general thoughts). Persistence lives outside
-- the events table because feedback isn't a civic event — it's
-- operator-facing product input. Future moderation/admin tooling can
-- read this directly without traversing the event log.
--
-- Both signed-in and anonymous submissions are supported. user_id is
-- ON DELETE SET NULL so a self-service account deletion (Slice 13.11)
-- doesn't take operator-facing feedback with it; the row stays for
-- triage but loses attribution.
-- =====================================================================

CREATE TABLE feedback_submissions (
  id           TEXT        PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  category     TEXT        NOT NULL,
  message      TEXT        NOT NULL,
  name         TEXT,
  email        TEXT,
  user_id      TEXT        REFERENCES users(id) ON DELETE SET NULL,
  user_agent   TEXT,

  CONSTRAINT feedback_submissions_category_chk
    CHECK (category IN ('idea', 'bug', 'moderation', 'general')),
  CONSTRAINT feedback_submissions_message_nonempty
    CHECK (length(trim(message)) > 0)
);

CREATE INDEX feedback_submissions_created_at_idx
  ON feedback_submissions (created_at DESC);

CREATE INDEX feedback_submissions_category_idx
  ON feedback_submissions (category);

COMMENT ON TABLE feedback_submissions IS
  'Operator-facing product feedback. Not a civic event — does not flow through the events table.';
COMMENT ON COLUMN feedback_submissions.category IS
  'One of: idea | bug | moderation | general. Used for triage routing.';
COMMENT ON COLUMN feedback_submissions.user_id IS
  'Optional FK to users. ON DELETE SET NULL so account deletion preserves the feedback row but drops attribution.';
