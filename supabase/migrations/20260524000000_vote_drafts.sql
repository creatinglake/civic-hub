-- Vote drafts — AI-augmented vote drafting with conversation history.
-- Mirrors the proposal_drafts pattern but without category/considerations/steward fields.

CREATE TABLE vote_drafts (
  id                         TEXT PRIMARY KEY,
  user_id                    TEXT NOT NULL,
  title                      TEXT NOT NULL DEFAULT '',
  description                TEXT NOT NULL DEFAULT '',
  sources                    TEXT NOT NULL DEFAULT '',
  voting_duration_ms         BIGINT NOT NULL DEFAULT 2592000000,
  conversation_history       JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_review_result         JSONB,
  draft_modified_since_review BOOLEAN NOT NULL DEFAULT false,
  assistant_helped           BOOLEAN NOT NULL DEFAULT false,
  status                     TEXT NOT NULL DEFAULT 'drafting',
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vote_drafts_user_status ON vote_drafts (user_id, status);

CREATE TRIGGER set_vote_drafts_updated_at
  BEFORE UPDATE ON vote_drafts
  FOR EACH ROW
  EXECUTE FUNCTION set_updated_at();

ALTER TABLE vote_drafts ENABLE ROW LEVEL SECURITY;
