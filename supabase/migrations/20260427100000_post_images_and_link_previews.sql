-- Slice 9 — image attachments + link previews
--
-- Two concerns in one migration:
--
--   1. Image attachments on announcements + vote-results.
--      No column changes — image_url and image_alt live INSIDE the
--      `processes.state` JSON blob (under content.image_url /
--      content.image_alt). The convention is documented here for
--      future maintainers grepping for image-related schema work:
--
--          processes.state -> 'content' ->> 'image_url'   text | null
--          processes.state -> 'content' ->> 'image_alt'   text | null
--
--      Validation rule (server-side, enforced in the module services):
--      when image_url is set, image_alt MUST be a non-empty string of
--      length <= 200. Alt text is required for accessibility.
--
--      Files themselves live in a Supabase Storage bucket named
--      `post-images` (public read, authenticated write, 5 MB cap,
--      MIME whitelist: image/jpeg, image/png, image/webp, image/gif).
--      The bucket is created via the Supabase dashboard — see
--      HANDOFF.md "Slice 9" for the operator walkthrough.
--
--   2. Link-preview cache. New table backs the civic.link_preview
--      service module. URL is the natural primary key; canonical_url
--      and the og_* fields are derived. fetched_at carries the cache
--      epoch (TTL: 7 days success / 1 hour error). `error` is non-null
--      iff the fetch failed — readers branch on its presence.
--
-- Apply via Supabase → SQL Editor → New query → paste → Run.
-- Verify with:
--   SELECT count(*) FROM link_previews;   -- expect 0
--
-- This migration must be applied BEFORE redeploying Slice 9 code that
-- reads/writes link_previews. Image attachments work without it (data
-- in JSON), but link previews 500 until the table exists.

BEGIN;

CREATE TABLE IF NOT EXISTS link_previews (
  url            text PRIMARY KEY,
  canonical_url  text,
  title          text,
  description    text,
  image_url      text,
  site_name      text,
  fetched_at     timestamptz NOT NULL,
  error          text
);

-- Speed up the staleness check used by the cache lookup.
CREATE INDEX IF NOT EXISTS link_previews_fetched_at_idx
  ON link_previews (fetched_at);

COMMIT;
