-- Required-name policy: residents participate under their real name
-- (votes stay ballot-secret; comments can opt into anonymity).
-- Nullable — existing accounts are re-gated in the UI on their next
-- sign-in / participation attempt, and requireResident rejects
-- participation until the name is set.
ALTER TABLE users ADD COLUMN IF NOT EXISTS full_name TEXT;
