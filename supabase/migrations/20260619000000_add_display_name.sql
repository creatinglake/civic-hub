-- Add display_name to users table for Board of Supervisors attribution.
-- Nullable — only set for users who have a public-facing role (BoS members,
-- committee chairs, etc.). Regular residents leave it null.
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
