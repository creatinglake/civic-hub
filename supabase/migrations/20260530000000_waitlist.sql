-- Beta waitlist — stores emails of people who want access when the hub
-- opens up. Append-only; admin reads via the admin settings panel.

CREATE TABLE waitlist (
  email       TEXT PRIMARY KEY,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes       TEXT
);

ALTER TABLE waitlist ENABLE ROW LEVEL SECURITY;
-- No permissive policies — service_role only (same convention as hub_settings).
