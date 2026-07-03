-- OTP brute-force defense (audit P1 — account takeover).
-- Track wrong verification guesses per pending code so verifyCode can burn the
-- code after MAX_VERIFY_ATTEMPTS. Nullable-safe default 0 so existing rows and
-- older code paths keep working.
ALTER TABLE pending_verifications ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
