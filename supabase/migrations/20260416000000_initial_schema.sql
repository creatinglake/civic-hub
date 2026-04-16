-- =====================================================================
-- Civic Hub — Initial Schema (v0.1)
-- =====================================================================
-- Migrates in-memory Maps/arrays to Postgres.
-- Mirrors the module boundaries in civic-hub/src/modules/:
--   civic.auth        -> users, sessions, pending_verifications
--   (core)            -> processes, events
--   civic.proposals   -> proposals, proposal_supports
--   civic.receipts    -> vote_records, vote_participation  (STRICT SEPARATION)
--   civic.input       -> community_inputs
--
-- RLS: enabled on every table with NO permissive policies.
--      Backend uses the service_role key, which bypasses RLS.
--      The anon/publishable key cannot read or write anything.
--
-- IDs: text format matches current code (user_<hex>, proc_<hex>, etc.).
--      Application code continues to generate IDs; DB just stores them.
-- =====================================================================

-- Useful extensions (safe to re-run)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ---------------------------------------------------------------------
-- Helper: auto-update updated_at column
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ---------------------------------------------------------------------
-- Helper: block UPDATE/DELETE on append-only tables (events)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION prevent_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only; UPDATE/DELETE not permitted', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;


-- =====================================================================
-- civic.auth
-- =====================================================================

CREATE TABLE users (
  id             TEXT PRIMARY KEY,
  email          TEXT NOT NULL UNIQUE,
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_resident    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX users_email_idx ON users (email);


CREATE TABLE sessions (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX sessions_user_id_idx  ON sessions (user_id);
CREATE INDEX sessions_expires_idx  ON sessions (expires_at);


CREATE TABLE pending_verifications (
  email       TEXT PRIMARY KEY,
  code        TEXT NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX pending_verifications_expires_idx ON pending_verifications (expires_at);


-- =====================================================================
-- Core: processes
-- =====================================================================

CREATE TABLE processes (
  id                    TEXT PRIMARY KEY,
  type                  TEXT NOT NULL,      -- 'civic.vote', 'civic.proposal'
  title                 TEXT NOT NULL,
  description           TEXT,
  jurisdiction          TEXT,
  status                TEXT NOT NULL,      -- draft|proposed|threshold_met|scheduled|active|closed|finalized
  content               JSONB,              -- ProcessContent
  state                 JSONB NOT NULL DEFAULT '{}'::jsonb,   -- handler-specific
  config                JSONB,              -- handler-specific
  created_by            TEXT,
  source_proposal_id    TEXT,               -- optional link to a civic.proposals record
  starts_at             TIMESTAMPTZ,
  ends_at               TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER processes_updated_at
  BEFORE UPDATE ON processes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX processes_type_idx       ON processes (type);
CREATE INDEX processes_status_idx     ON processes (status);
CREATE INDEX processes_jurisdiction_idx ON processes (jurisdiction);
CREATE INDEX processes_created_at_idx ON processes (created_at DESC);


-- =====================================================================
-- Core: events  (append-only; UPDATE/DELETE blocked by trigger)
-- =====================================================================

CREATE TABLE events (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  process_id    TEXT,                -- nullable (e.g. proposal events)
  actor_id      TEXT,
  jurisdiction  TEXT,
  action_url    TEXT,
  object        JSONB,
  context       JSONB,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER events_no_mutation
  BEFORE UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

-- Indexes for the event feed + filters
CREATE INDEX events_created_at_idx           ON events (created_at DESC);
CREATE INDEX events_process_id_created_idx   ON events (process_id, created_at DESC);
CREATE INDEX events_type_idx                 ON events (type);


-- =====================================================================
-- civic.proposals
-- =====================================================================

CREATE TABLE proposals (
  id                        TEXT PRIMARY KEY,
  title                     TEXT NOT NULL,
  description               TEXT,
  links                     JSONB NOT NULL DEFAULT '[]'::jsonb,
  status                    TEXT NOT NULL,  -- submitted|endorsed|converted|archived
  support_count             INTEGER NOT NULL DEFAULT 0,
  submitted_by              TEXT,
  converted_to_process_id   TEXT,           -- loose link; no FK by design
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER proposals_updated_at
  BEFORE UPDATE ON proposals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX proposals_status_idx      ON proposals (status);
CREATE INDEX proposals_created_at_idx  ON proposals (created_at DESC);


CREATE TABLE proposal_supports (
  proposal_id  TEXT NOT NULL REFERENCES proposals(id) ON DELETE CASCADE,
  user_id      TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (proposal_id, user_id)
);

CREATE INDEX proposal_supports_proposal_idx ON proposal_supports (proposal_id);
CREATE INDEX proposal_supports_user_idx     ON proposal_supports (user_id);


-- =====================================================================
-- civic.receipts  —  PRIVACY-CRITICAL TABLES
-- =====================================================================
-- DO NOT EVER add user_id to vote_records.
-- DO NOT EVER add receipt_id to vote_participation.
-- These two tables intentionally share NO join key.
-- The privacy guarantee of anonymous voting depends on this separation.
-- =====================================================================

CREATE TABLE vote_records (
  receipt_id  TEXT PRIMARY KEY,            -- UUID (crypto.randomUUID)
  process_id  TEXT NOT NULL,
  choice      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- NO user_id column. Ever. This separation is the privacy guarantee.
);

CREATE INDEX vote_records_process_idx ON vote_records (process_id);

COMMENT ON TABLE vote_records IS
  'Anonymous vote ledger. MUST NOT contain any user identifier. Pair with vote_participation for duplicate prevention.';


CREATE TABLE vote_participation (
  user_id     TEXT NOT NULL,
  process_id  TEXT NOT NULL,
  has_voted   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, process_id)
  -- NO receipt_id column. Ever. This separation is the privacy guarantee.
);

CREATE INDEX vote_participation_process_idx ON vote_participation (process_id);

COMMENT ON TABLE vote_participation IS
  'Tracks whether a user has voted on a process (duplicate-vote prevention). MUST NOT contain receipt_id.';


-- =====================================================================
-- civic.input
-- =====================================================================

-- Sequence powers the `input_000001` display format in application code.
CREATE SEQUENCE community_inputs_seq START 1;

CREATE TABLE community_inputs (
  id            TEXT PRIMARY KEY,
  process_id    TEXT NOT NULL,
  author_id     TEXT,
  body          TEXT NOT NULL,
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX community_inputs_process_idx ON community_inputs (process_id, submitted_at DESC);


-- =====================================================================
-- Row Level Security
-- =====================================================================
-- Enable RLS everywhere with NO policies => default deny for anon role.
-- The backend connects with the service_role key, which bypasses RLS.
-- If the anon/publishable key is ever used (e.g. from a browser), it
-- cannot read or write any of these tables.
-- =====================================================================

ALTER TABLE users                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_verifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE processes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE events                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposals              ENABLE ROW LEVEL SECURITY;
ALTER TABLE proposal_supports      ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_records           ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_participation     ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_inputs       ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owner (belt and suspenders)
ALTER TABLE users                  FORCE ROW LEVEL SECURITY;
ALTER TABLE sessions               FORCE ROW LEVEL SECURITY;
ALTER TABLE pending_verifications  FORCE ROW LEVEL SECURITY;
ALTER TABLE processes              FORCE ROW LEVEL SECURITY;
ALTER TABLE events                 FORCE ROW LEVEL SECURITY;
ALTER TABLE proposals              FORCE ROW LEVEL SECURITY;
ALTER TABLE proposal_supports      FORCE ROW LEVEL SECURITY;
ALTER TABLE vote_records           FORCE ROW LEVEL SECURITY;
ALTER TABLE vote_participation     FORCE ROW LEVEL SECURITY;
ALTER TABLE community_inputs       FORCE ROW LEVEL SECURITY;
