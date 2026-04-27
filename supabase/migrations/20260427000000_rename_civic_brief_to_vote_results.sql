-- Slice 8.5 — rename civic.brief → civic.vote_results
--
-- Updates the processes table on both axes that store the discriminator:
--   1. processes.type column         ('civic.brief'        → 'civic.vote_results')
--   2. processes.state ->> 'type'    ('civic.brief'        → 'civic.vote_results')
--
-- Events are append-only by spec and are NOT migrated. The Feed and the
-- digest filter both carry a small backwards-compat shim that accepts
-- either data.brief_id (legacy events) or data.results_id (new events)
-- when discriminating result_published events.
--
-- This migration must be applied BEFORE redeploying the Slice-8.5 code.
-- The new code looks up handlers by type='civic.vote_results' and will
-- fail to load any process row still typed 'civic.brief'.
--
-- Apply via Supabase → SQL Editor → New query → paste → Run.
-- Verify with:
--   SELECT type, COUNT(*) FROM processes GROUP BY type;
-- Expect: zero rows with type='civic.brief'; rows previously of that
-- type are now 'civic.vote_results'.

BEGIN;

UPDATE processes
SET type = 'civic.vote_results'
WHERE type = 'civic.brief';

UPDATE processes
SET state = jsonb_set(state, '{type}', '"civic.vote_results"', false)
WHERE state ->> 'type' = 'civic.brief';

COMMIT;
