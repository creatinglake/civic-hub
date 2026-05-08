-- Add phase column to community_inputs for proposal-to-vote comment carryover.
-- "proposal" = comment made during the proposal/endorsement period.
-- "vote" = comment made during the voting period.
-- NULL = legacy comment (treated as native to whatever process it belongs to).
ALTER TABLE community_inputs ADD COLUMN IF NOT EXISTS phase text;
