-- =====================================================================
-- Ballot secrecy — purge user ↔ ballot linkage from historical data
-- =====================================================================
-- The civic.receipts tables (vote_records / vote_participation) are now
-- the ONLY store of ballots, and vote_records carries no user linkage.
-- Two historical stores still linked user ids to ballot choices:
--
--   1. processes.state->'votes'  — { user_id: ballot } map kept by the
--      old civic.vote module. Replaced by an anonymous total_votes
--      counter; tallies are computed from vote_records.
--   2. civic.process.vote_submitted events — carried actor (user id)
--      plus data.vote.option, publicly readable via GET /events.
--      New emissions carry no ballot content and are restricted;
--      historical rows are deleted outright (events are append-only —
--      the events_no_update trigger blocks UPDATE, and a privacy purge
--      is the one legitimate reason to remove history).
--
-- Apply via Supabase → SQL Editor, or supabase db push.
-- Verify with:
--   SELECT count(*) FROM processes WHERE type='civic.vote' AND state ? 'votes';   -- expect 0
--   SELECT count(*) FROM events WHERE event_type='civic.process.vote_submitted'
--     AND (data->'vote') ? 'option';                                              -- expect 0

BEGIN;

-- 1. Replace the per-user ballot map with the anonymous counter.
UPDATE processes
SET state = (state - 'votes')
  || jsonb_build_object(
       'total_votes',
       (SELECT count(*)::int
          FROM jsonb_object_keys(COALESCE(state -> 'votes', '{}'::jsonb)))
     )
WHERE type = 'civic.vote'
  AND state ? 'votes';

-- 2. Remove historical vote_submitted events that link actor to ballot.
DELETE FROM events
WHERE event_type = 'civic.process.vote_submitted';

COMMIT;
