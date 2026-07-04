-- OTP lockout (audit P1 hardening, continued).
-- After MAX_VERIFY_ATTEMPTS wrong guesses, verifyCode stamps locked_until and
-- both verify and request-code refuse for the cooldown window. Nullable — no
-- lock by default; cleared whenever a fresh code is issued.
ALTER TABLE pending_verifications ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;
