-- Slice 10.5 — full-text search across the Civic Hub.
--
-- Three concerns in this migration:
--
--   1. processes.search_doc tsvector column + trigger + GIN index.
--      The trigger auto-populates the column whenever title, description,
--      or state changes; the GIN index makes `search_doc @@ tsquery`
--      lookups fast. No application code needs to think about keeping
--      this column fresh.
--
--   2. RPC function `search_processes(...)` — runs the parameterized
--      search query and returns ranked hits. Lives in Postgres so we
--      get ts_rank ordering at the query level (the JS query builder
--      can't sort by ts_rank, which is the reason we don't use
--      .textSearch() directly).
--
--   3. RPC function `search_processes_count(...)` — same predicates,
--      no LIMIT/OFFSET, returns a single count for the results page's
--      pagination total.
--
-- Apply via Supabase → SQL Editor → New query → paste → Run.
-- Verify with:
--   SELECT count(*) = (SELECT count(*) FROM processes)
--     AS backfill_complete
--   FROM processes WHERE search_doc IS NOT NULL;
-- Expect: t.

BEGIN;

-- 1. tsvector column ----------------------------------------------------------

ALTER TABLE processes
  ADD COLUMN IF NOT EXISTS search_doc tsvector;

-- Function: build the search document from title, description, and the
-- state JSON. Stringifying state captures announcement bodies, meeting
-- summary block titles, vote_context.description, vote_results
-- admin_notes, etc. without per-process-type extraction. Trade-off:
-- matches can hit JSON keys (e.g. "title") in addition to values,
-- producing occasional false positives. Acceptable for MVP — we can
-- add per-type extraction later if signal/noise drops below useful.
CREATE OR REPLACE FUNCTION processes_update_search_doc()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_doc := to_tsvector('english',
    COALESCE(NEW.title, '') || ' ' ||
    COALESCE(NEW.description, '') || ' ' ||
    COALESCE(NEW.state::text, '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger fires only when an indexable column changes. Crucially, this
-- list does NOT include search_doc itself, so the backfill UPDATE
-- below doesn't recurse and we don't pay re-tokenization cost on an
-- internal write.
DROP TRIGGER IF EXISTS processes_search_doc_trigger ON processes;
CREATE TRIGGER processes_search_doc_trigger
  BEFORE INSERT OR UPDATE OF title, description, state
  ON processes
  FOR EACH ROW
  EXECUTE FUNCTION processes_update_search_doc();

-- GIN index makes tsvector @@ tsquery O(log n) instead of O(n).
CREATE INDEX IF NOT EXISTS processes_search_doc_idx
  ON processes
  USING GIN(search_doc);

-- Backfill existing rows. The trigger only fires on subsequent writes,
-- so seeded / pre-Slice-10.5 rows would otherwise have NULL search_doc.
UPDATE processes
SET search_doc = to_tsvector('english',
  COALESCE(title, '') || ' ' ||
  COALESCE(description, '') || ' ' ||
  COALESCE(state::text, '')
)
WHERE search_doc IS NULL;

-- 2. search_processes RPC -----------------------------------------------------
--
-- The host hub calls this via supabase-js .rpc(). Returns enough fields
-- for the controller to build a SearchHit without a second round-trip.
-- Status filter excludes drafts and pending records. Moderation
-- predicate excludes any post a future Slice 11 marks as removed.
-- Sort is "relevance" by default (ts_rank desc); "newest" falls back
-- to created_at desc.

CREATE OR REPLACE FUNCTION search_processes(
  p_q text,
  p_types text[] DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL,
  p_sort text DEFAULT 'relevance',
  p_limit int DEFAULT 25,
  p_offset int DEFAULT 0
)
RETURNS TABLE (
  id text,
  type text,
  title text,
  description text,
  status text,
  state jsonb,
  created_at timestamptz,
  rank real
)
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('english', p_q) AS query
  )
  SELECT
    p.id,
    p.type,
    p.title,
    p.description,
    p.status::text,
    p.state,
    p.created_at,
    ts_rank(p.search_doc, q.query) AS rank
  FROM processes p, q
  WHERE
    p.search_doc @@ q.query
    AND p.status IN ('active', 'closed', 'finalized')
    AND (
      p.state -> 'moderation' ->> 'removed' IS NULL
      OR p.state -> 'moderation' ->> 'removed' = 'false'
    )
    AND (p_types IS NULL OR p.type = ANY(p_types))
    AND (p_from IS NULL OR p.created_at >= p_from)
    AND (p_to   IS NULL OR p.created_at <= p_to)
  ORDER BY
    CASE WHEN p_sort = 'newest' THEN NULL ELSE ts_rank(p.search_doc, q.query) END DESC NULLS LAST,
    CASE WHEN p_sort = 'newest' THEN p.created_at ELSE NULL END DESC NULLS LAST,
    p.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- 3. search_processes_count RPC ----------------------------------------------
--
-- Same predicates, sans pagination and ordering. Cheap because the GIN
-- index serves the @@ predicate; the rest are filters on already-narrow
-- result sets.

CREATE OR REPLACE FUNCTION search_processes_count(
  p_q text,
  p_types text[] DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('english', p_q) AS query
  )
  SELECT count(*)::bigint
  FROM processes p, q
  WHERE
    p.search_doc @@ q.query
    AND p.status IN ('active', 'closed', 'finalized')
    AND (
      p.state -> 'moderation' ->> 'removed' IS NULL
      OR p.state -> 'moderation' ->> 'removed' = 'false'
    )
    AND (p_types IS NULL OR p.type = ANY(p_types))
    AND (p_from IS NULL OR p.created_at >= p_from)
    AND (p_to   IS NULL OR p.created_at <= p_to);
$$;

COMMIT;
