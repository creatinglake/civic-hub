-- Proposal drafts — AI-augmented proposal drafting with conversation history.
-- Adds category + assistant_helped columns to existing proposals table.

-- --- Extend proposals table ---

ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS assistant_helped BOOLEAN NOT NULL DEFAULT false;

-- --- Proposal drafts table ---

CREATE TABLE proposal_drafts (
  id               TEXT PRIMARY KEY,
  user_id          TEXT NOT NULL,
  category         TEXT,
  title            TEXT NOT NULL DEFAULT '',
  description      TEXT NOT NULL DEFAULT '',
  sources          TEXT NOT NULL DEFAULT '',
  considerations   TEXT NOT NULL DEFAULT '',
  conversation_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  last_review_result   JSONB,
  draft_modified_since_review BOOLEAN NOT NULL DEFAULT false,
  steward_approved BOOLEAN,
  assistant_helped BOOLEAN NOT NULL DEFAULT false,
  status           TEXT NOT NULL DEFAULT 'drafting',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_proposal_drafts_user_status ON proposal_drafts (user_id, status);

-- Reuse the updated_at trigger pattern from initial schema
CREATE TRIGGER set_proposal_drafts_updated_at
  BEFORE UPDATE ON proposal_drafts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- RLS: service-role only (same pattern as other tables)
ALTER TABLE proposal_drafts ENABLE ROW LEVEL SECURITY;
