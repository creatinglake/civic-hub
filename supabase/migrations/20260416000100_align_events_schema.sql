-- =====================================================================
-- Migration 002 — align events table with CivicEvent model
-- =====================================================================
-- Migration 001 used columns that loosely mirrored the Civic Event Spec
-- (`type`, `object`, `metadata`). The current application model
-- (civic-hub/src/models/event.ts) uses `event_type`, `data`, `meta`,
-- `source`, `version`, and `dedupe_key`. Aligning the database with the
-- application model avoids pointless mapping in the DAL.
--
-- (Spec alignment of the model itself is a deferred task per HANDOFF.md.)
-- =====================================================================

-- Rename columns to match the model.
ALTER TABLE events RENAME COLUMN type       TO event_type;
ALTER TABLE events RENAME COLUMN actor_id   TO actor;
ALTER TABLE events RENAME COLUMN object     TO data;
ALTER TABLE events RENAME COLUMN metadata   TO meta;

-- Drop an unused column.
ALTER TABLE events DROP COLUMN context;

-- Add new columns.
ALTER TABLE events ADD COLUMN version     TEXT NOT NULL DEFAULT '1.0';
ALTER TABLE events ADD COLUMN dedupe_key  TEXT;
ALTER TABLE events ADD COLUMN source      JSONB;

-- Rebuild the event_type index on the new column name.
DROP INDEX IF EXISTS events_type_idx;
CREATE INDEX events_event_type_idx ON events (event_type);

-- --------------------------------------------------------------------------
-- Relax the append-only trigger to block UPDATE only (not DELETE).
-- --------------------------------------------------------------------------
-- Migration 001 blocked both UPDATE and DELETE on events, which made it
-- impossible to reset the event log for dev seed/test flows. UPDATE is the
-- important guarantee (history is not mutated). DELETE is only used by
-- clearEvents(), which is gated to dev at the application layer
-- (CIVIC_ALLOW_SEED). Compromised service_role credentials could DELETE
-- either way, so blocking DELETE at the DB level doesn't meaningfully
-- improve defense in depth.
-- --------------------------------------------------------------------------

DROP TRIGGER IF EXISTS events_no_mutation ON events;

CREATE TRIGGER events_no_update
  BEFORE UPDATE ON events
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();
