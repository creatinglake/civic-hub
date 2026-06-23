-- Add voting method support to vote_drafts.
-- The method field selects the voting algorithm (yes_no_unsure, approval, etc.).
-- custom_options stores the user-defined option set for methods that need it.

ALTER TABLE vote_drafts
  ADD COLUMN IF NOT EXISTS method TEXT NOT NULL DEFAULT 'yes_no_unsure',
  ADD COLUMN IF NOT EXISTS custom_options JSONB DEFAULT NULL;
