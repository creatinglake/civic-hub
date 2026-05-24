-- Add duration support to proposals.
-- Proposals now have a closes_at timestamp computed from the user-chosen
-- duration at draft submission time. Default duration: 90 days (3 months).

-- --- Extend proposals table ---
ALTER TABLE proposals
  ADD COLUMN IF NOT EXISTS closes_at TIMESTAMPTZ;

-- --- Extend proposal_drafts table ---
-- Default: 90 days in milliseconds = 7776000000
ALTER TABLE proposal_drafts
  ADD COLUMN IF NOT EXISTS proposal_duration_ms BIGINT NOT NULL DEFAULT 7776000000;
