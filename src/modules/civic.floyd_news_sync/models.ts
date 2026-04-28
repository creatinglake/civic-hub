// civic.floyd_news_sync — type definitions
//
// Pulls from a jurisdiction's news/announcements page (initially the
// Floyd County government Wix site at floydcova.gov/news) and creates
// civic.announcement rows automatically. No admin review queue: synced
// items publish to the feed instantly, with the feed-card click routing
// to the external source URL rather than an internal page.
//
// The module is small on purpose. Floyd's news posts have minimal
// extractable body content (Wix renders bodies client-side), so we
// don't try to mirror them — we just notify residents that a new post
// exists and link out. See HANDOFF.md "Slice 13" for the design rationale.

/**
 * One news entry as discovered on the source's listing page. The
 * `share_url` is also the dedupe key on subsequent runs — we ingest at
 * most one civic.announcement per share_url ever.
 */
export interface FloydNewsEntry {
  /** Plain-text title from the listing card. */
  title: string;
  /**
   * The post's permanent URL (the "share post" link on Wix). Click on
   * the synced feed card routes here. Validated to match the
   * `https://www.floydcova.gov/post/...` shape — entries that don't
   * match are dropped during validation.
   */
  share_url: string;
  /**
   * The post's headline image URL, if any. Wix CDN URLs (often
   * `static.wixstatic.com/media/...`). The feed card thumbnail
   * references this directly — we don't re-host. Null when no image.
   */
  image_url: string | null;
  /**
   * Event date extracted from the title or URL slug, if discernible
   * (e.g. "Board of Supervisors Meeting 04/28/2026" → `2026-04-28`).
   * Null for open-ended announcements (burn ban, lawn care bid, etc.)
   * — those never expire and are always included.
   *
   * The date filter excludes entries with a strictly-past `event_date`,
   * keeps entries with today's date, future dates, or null. ISO 8601
   * date format (YYYY-MM-DD).
   */
  event_date: string | null;
}

/** Run-time configuration injected by the controller. */
export interface FloydNewsSyncConfig {
  /** Listing page URL to fetch. */
  source_url: string;
  /** Anthropic model to use for extraction. */
  model: string;
}
