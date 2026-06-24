-- =====================================================================
-- Process Reviews — collaborative admin review before publication
-- =====================================================================
-- Every resident-created process goes through admin review before going
-- live. The review is a multi-round conversation between the creator
-- and admin, tracked as a sequence of turns.
--
-- Tables:
--   process_reviews  — one per submission, tracks review lifecycle
--   review_turns     — append-only thread of actions/notes
--
-- The reviewed process itself lives in the existing `processes` table
-- with status = 'pending_review'. On approval it flips to the
-- appropriate live status (active, proposed, etc.).
-- =====================================================================

-- ---------------------------------------------------------------------
-- process_reviews
-- ---------------------------------------------------------------------

CREATE TABLE process_reviews (
  id              TEXT PRIMARY KEY,
  process_id      TEXT NOT NULL REFERENCES processes(id) ON DELETE CASCADE,
  creator_id      TEXT NOT NULL,
  creator_name    TEXT NOT NULL,
  creator_email   TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending_review',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER process_reviews_updated_at
  BEFORE UPDATE ON process_reviews
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX process_reviews_process_id_idx ON process_reviews (process_id);
CREATE INDEX process_reviews_creator_id_idx ON process_reviews (creator_id);
CREATE INDEX process_reviews_status_idx     ON process_reviews (status);
CREATE INDEX process_reviews_created_at_idx ON process_reviews (created_at DESC);

ALTER TABLE process_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_reviews FORCE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- review_turns — append-only thread
-- ---------------------------------------------------------------------

CREATE TABLE review_turns (
  id                TEXT PRIMARY KEY,
  review_id         TEXT NOT NULL REFERENCES process_reviews(id) ON DELETE CASCADE,
  turn_number       INTEGER NOT NULL,
  actor             TEXT NOT NULL,
  actor_role        TEXT NOT NULL,  -- 'creator' | 'admin'
  action            TEXT NOT NULL,  -- submit | request_changes | approve | decline | revise_resubmit | withdraw
  note              TEXT,
  process_snapshot  JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER review_turns_no_mutation
  BEFORE UPDATE OR DELETE ON review_turns
  FOR EACH ROW EXECUTE FUNCTION prevent_modification();

CREATE INDEX review_turns_review_id_idx ON review_turns (review_id, turn_number);

ALTER TABLE review_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_turns FORCE ROW LEVEL SECURITY;


-- ---------------------------------------------------------------------
-- Add review_id to processes (nullable FK back to the review)
-- ---------------------------------------------------------------------

ALTER TABLE processes ADD COLUMN review_id TEXT REFERENCES process_reviews(id);
CREATE INDEX processes_review_id_idx ON processes (review_id) WHERE review_id IS NOT NULL;
