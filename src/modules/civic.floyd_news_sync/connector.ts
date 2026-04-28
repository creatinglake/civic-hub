// civic.floyd_news_sync — Wix listing-page parser
//
// Floyd's /news page is server-rendered HTML wrapped in heavy Wix
// chrome. We trim aggressively (drop scripts/styles/svgs/images, keep
// <a href>) and hand the trimmed result to Claude for structured
// extraction. The same trim approach is used by the meeting-summary
// connector — see civic.meeting_summary/connectors/floydMinutes.ts for
// the original pattern.

import * as cheerio from "cheerio";
import type { FloydNewsEntry } from "./models.js";

const TAGS_TO_STRIP = [
  "script",
  "style",
  "noscript",
  "link",
  "meta",
  "svg",
  "iframe",
  "picture",
  "source",
  "video",
  "audio",
  "canvas",
  "template",
  "head",
];

/** Per-element attributes worth preserving for Claude's extraction. */
const KEEP_ATTRS = new Set(["href", "src", "alt", "title", "data-src"]);

/**
 * Strip Wix chrome / scripts / SVGs while preserving <a href> and <img src>
 * (we need the post URLs and image URLs). Also drops Wix data-* attributes
 * and stylistic attributes that bloat the payload by 3-5x.
 */
export function trimNewsHtml(rawHtml: string): string {
  const $ = cheerio.load(rawHtml);
  for (const tag of TAGS_TO_STRIP) $(tag).remove();
  $("[aria-hidden='true']").remove();

  $("*").each((_i, el) => {
    if (el.type !== "tag") return;
    const attribs = (el as unknown as { attribs: Record<string, string> }).attribs;
    if (!attribs) return;
    for (const name of Object.keys(attribs)) {
      if (!KEEP_ATTRS.has(name)) delete attribs[name];
    }
  });

  // Prefer <main>, fall back to <body>. Wix often wraps the listing in
  // a main region; the rest is global chrome.
  const region = $("main").first();
  const target = region.length > 0 ? region : $("body");
  const html = target.html() ?? "";
  return collapseWhitespace(html);
}

function collapseWhitespace(html: string): string {
  return html.replace(/[ \t\r]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

const SHARE_URL_PATTERN =
  /^https:\/\/www\.floydcova\.gov\/post\/[A-Za-z0-9_-]+$/;
const IMAGE_URL_PATTERN = /^https?:\/\/.+/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a single Claude-returned entry. Drops malformed entries
 * silently (with a warn log) so a single bad row doesn't fail the run.
 */
export function isValidEntry(raw: unknown): raw is FloydNewsEntry {
  if (!raw || typeof raw !== "object") return false;
  const e = raw as Partial<FloydNewsEntry>;

  if (typeof e.title !== "string" || e.title.trim().length === 0) {
    return false;
  }
  if (e.title.length > 300) return false;

  if (typeof e.share_url !== "string" || !SHARE_URL_PATTERN.test(e.share_url)) {
    return false;
  }

  if (e.image_url !== null) {
    if (typeof e.image_url !== "string" || !IMAGE_URL_PATTERN.test(e.image_url)) {
      return false;
    }
  }

  if (e.event_date !== null) {
    if (
      typeof e.event_date !== "string" ||
      !ISO_DATE_PATTERN.test(e.event_date)
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Filter helper — does this entry's event_date qualify for ingestion?
 *
 * Rules (per user spec):
 *   - event_date === null → INCLUDE (open-ended announcement like a burn ban)
 *   - event_date >= today  → INCLUDE (today or future)
 *   - event_date <  today  → EXCLUDE (past event, no point notifying about it)
 *
 * `today` is passed in (not read from `new Date()` here) so the
 * controller can stamp a single "now" for an entire run and avoid drift
 * mid-batch.
 */
export function isFutureOrUndated(
  entry: FloydNewsEntry,
  today_iso: string,
): boolean {
  if (entry.event_date === null) return true;
  // String comparison works because both are ISO YYYY-MM-DD.
  return entry.event_date >= today_iso;
}
