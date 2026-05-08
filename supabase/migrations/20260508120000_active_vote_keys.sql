-- =====================================================================
-- Active vote keys — Slice 13: change-your-vote-while-open
--
-- Bridges user_id → receipt_id ONLY while a vote is active. When
-- closeVote runs, all rows for the closed process are deleted, restoring
-- the strict separation between vote_records and vote_participation that
-- the rest of the receipt schema enforces.
--
-- Trust model:
--   While voting is open, an admin with DB access COULD correlate
--   user → choice via this table. This is intentional and matches the
--   paper-ballot mental model: ballots can be changed before the box
--   closes; once closed, only counted ballots remain.
--
--   Post-close, no row in any persisted table links a user to their
--   choice. The privacy guarantee outside the active window is
--   identical to the pre-Slice-13 state.
--
-- Lifecycle:
--   INSERT  on first vote (receipt is created, key stored alongside)
--   UPDATE  is never used — receipt_id is stable for the duration
--   DELETE  on closeVote (per process), or per-row if a vote is rolled back
-- =====================================================================

CREATE TABLE active_vote_keys (
  user_id     TEXT NOT NULL,
  process_id  TEXT NOT NULL,
  receipt_id  TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, process_id)
);

CREATE INDEX active_vote_keys_process_idx ON active_vote_keys (process_id);

COMMENT ON TABLE active_vote_keys IS
  'Transient bridge between user_id and receipt_id. Populated only while a vote is active; cleared on closeVote. Allows residents to change their vote before the close while preserving post-close anonymity.';

ALTER TABLE active_vote_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_vote_keys FORCE  ROW LEVEL SECURITY;
