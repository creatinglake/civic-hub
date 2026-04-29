// civic.floyd_news_sync — RSS feed parser
//
// Floyd's Wix site exposes /blog-feed.xml as a structured RSS 2.0 feed
// with title, link, pubDate, and (sometimes) description per item. We
// use this instead of scraping the /news listing because:
//   - It's structured XML — no Claude needed for discovery (faster + free).
//   - It exposes more posts than the listing page (19 vs 3).
//   - Real publication dates instead of relative "X days ago" strings.
//   - When authors include a description, we get it directly.
//
// Wix does NOT include post body content in RSS — only ~25% of items
// have any description text at all. The other ~75% are
// title-and-permalink only. The card UI handles this gracefully:
// when body is empty the card just renders title + pill + timestamp.

import * as cheerio from "cheerio";
import type { FloydNewsEntry } from "./models.js";

/**
 * Parse an RSS 2.0 XML document into FloydNewsEntry objects.
 *
 * Skips malformed items but doesn't throw on unrecognized fields. The
 * caller is responsible for filtering by date and validating URLs.
 */
export function parseRssFeed(rawXml: string): FloydNewsEntry[] {
  const $ = cheerio.load(rawXml, { xmlMode: true });
  const entries: FloydNewsEntry[] = [];

  $("item").each((_i, el) => {
    const $item = $(el);
    const title = ($item.find("title").first().text() ?? "").trim();
    const link = ($item.find("link").first().text() ?? "").trim();
    const description = ($item.find("description").first().text() ?? "").trim();
    const pubDateText = ($item.find("pubDate").first().text() ?? "").trim();

    if (title.length === 0 || link.length === 0) return;
    if (!SHARE_URL_PATTERN.test(link)) return;

    const event_date = parseEventDate(title, link);
    const pub_date_iso = parseRfc822ToIso(pubDateText);

    entries.push({
      title,
      share_url: link,
      // Wix RSS sometimes wraps the description in CDATA with HTML
      // formatting; cheerio's text() unwraps both. Strip residual tags
      // defensively in case the description contains inline HTML.
      body: stripHtml(description),
      event_date,
      pub_date_iso,
    });
  });

  return entries;
}

const SHARE_URL_PATTERN =
  /^https:\/\/www\.floydcova\.gov\/post\/[A-Za-z0-9_-]+$/;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Try to extract an event date from the title or URL slug.
 *
 * Title forms we recognize:
 *   "Board of Supervisors Meeting 04/28/2026" → 2026-04-28
 *   "Christmas Parade December 14 2025" → 2025-12-14
 *   "April 21st Update"                → null (year not specified)
 *
 * URL slug forms:
 *   "board-of-supervisors-meeting-04-28-2026" → 2026-04-28
 *
 * Returns null when no date with a year can be confidently extracted.
 * The date filter treats null as "include" (open-ended posts like
 * burn bans and bid solicitations).
 */
export function parseEventDate(title: string, url: string): string | null {
  // MM/DD/YYYY in the title
  const slashMatch = title.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashMatch) {
    const [, mm, dd, yyyy] = slashMatch;
    const iso = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    if (ISO_DATE_PATTERN.test(iso) && isValidDate(iso)) return iso;
  }

  // MM-DD-YYYY in URL slug (after the pattern Wix uses for date suffix)
  const slugMatch = url.match(/(\d{1,2})-(\d{1,2})-(\d{4})(?:[/?#]|$)/);
  if (slugMatch) {
    const [, mm, dd, yyyy] = slugMatch;
    const iso = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    if (ISO_DATE_PATTERN.test(iso) && isValidDate(iso)) return iso;
  }

  // Don't try harder. "April 21st Update" without a year would tempt a
  // year guess, but those guesses cause stale items to be incorrectly
  // included or future items to be incorrectly excluded.
  return null;
}

/**
 * Validate ISO date string represents a real calendar date (not 02-30 etc.).
 */
function isValidDate(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

/**
 * Convert an RFC 822 / 2822 date (RSS pubDate format) to ISO 8601 UTC.
 * "Sat, 25 Apr 2026 01:41:59 GMT" → "2026-04-25T01:41:59.000Z"
 *
 * Returns null on parse failure (the caller falls back to ingestion time).
 */
export function parseRfc822ToIso(rfc822: string): string | null {
  if (!rfc822) return null;
  const ms = Date.parse(rfc822);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

/**
 * Defensive HTML strip — Wix descriptions sometimes include inline
 * markup (`<br/>`, `<p>`, etc.) even when the displayed content is
 * plain text. Removes tags, decodes a small set of common entities,
 * and collapses whitespace. Anything more aggressive (e.g. running a
 * full HTML parser) is overkill for the short snippets RSS carries.
 */
function stripHtml(s: string): string {
  if (!s) return "";
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Filter helper — does this entry's event_date qualify for ingestion?
 *
 *   - event_date === null → INCLUDE (open-ended announcement)
 *   - event_date >= today  → INCLUDE (today or future)
 *   - event_date <  today  → EXCLUDE (past event)
 *
 * `today_iso` is passed in (not read from `new Date()`) so the
 * controller can stamp a single "now" for an entire run.
 */
export function isFutureOrUndated(
  entry: FloydNewsEntry,
  today_iso: string,
): boolean {
  if (entry.event_date === null) return true;
  return entry.event_date >= today_iso;
}
