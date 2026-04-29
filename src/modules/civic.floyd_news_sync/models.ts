// civic.floyd_news_sync — type definitions
//
// Pulls from Floyd's Wix RSS feed (/blog-feed.xml) and creates one
// civic.announcement per new post. Auto-published — no admin queue.
// Click on the synced feed card opens the post on Floyd's site.
//
// Wix RSS only sometimes includes post body content (~25% of items
// have a description). When it doesn't, the synced card renders with
// an empty body — title + pill + timestamp only. We do NOT attempt to
// invent body text via Claude; civic content shouldn't carry
// hallucinated specifics.
//
// Per slice 13.1 redesign: thumbnails removed entirely (Wix's
// document-scan thumbnails are unreadable noise), and we no longer
// hit Claude for discovery (RSS XML is structured).

/**
 * One news entry as parsed from the source RSS feed. The `share_url`
 * is also the dedupe key on subsequent runs — we ingest at most one
 * civic.announcement per share_url ever.
 */
export interface FloydNewsEntry {
  /** Plain-text title from the RSS <title> element. */
  title: string;
  /**
   * The post's permanent URL (Wix `<link>`). Click on the synced feed
   * card routes here. Validated to match the
   * `https://www.floydcova.gov/post/...` shape — entries that don't
   * match are dropped during parsing.
   */
  share_url: string;
  /**
   * Plain-text body content from the RSS <description>, with HTML
   * stripped and whitespace collapsed. Empty string when Wix didn't
   * include a description (the common case). The card UI renders an
   * empty-body card cleanly; the hub admin can manually annotate via
   * PATCH /announcement/:id later if desired.
   */
  body: string;
  /**
   * Event date extracted from the title (e.g. "Board of Supervisors
   * Meeting 04/28/2026") or URL slug (e.g.
   * `board-of-supervisors-meeting-04-28-2026`). Null when no date
   * with a year can be confidently extracted — those entries are
   * always ingested (open-ended announcements like burn bans, bid
   * solicitations, etc.). ISO 8601 (YYYY-MM-DD).
   */
  event_date: string | null;
  /**
   * Publication date from the RSS <pubDate> element, normalized to
   * ISO 8601 UTC. Null when parsing failed (rare). The controller
   * uses this to stamp the announcement's created_at; cards display
   * "X minutes ago" relative to it.
   */
  pub_date_iso: string | null;
}

/** Run-time configuration injected by the controller. */
export interface FloydNewsSyncConfig {
  /** RSS feed URL to fetch. */
  source_url: string;
}
