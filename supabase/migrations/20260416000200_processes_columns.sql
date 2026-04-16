-- =====================================================================
-- Migration 003 — add hub_id and process_version to processes
-- =====================================================================
-- The Process model (civic-hub/src/models/process.ts) carries hubId and
-- a ProcessDefinition that includes a version string. Migration 001 missed
-- those. This adds:
--   hub_id            — for federation (each process knows which hub it runs on)
--   process_version   — carries definition.version (e.g. "0.1")
--
-- Nullable hub_id is fine: existing rows have none, new rows get set by
-- processService using the hub's HUB_ID constant.
-- =====================================================================

ALTER TABLE processes ADD COLUMN hub_id          TEXT;
ALTER TABLE processes ADD COLUMN process_version TEXT NOT NULL DEFAULT '0.1';
