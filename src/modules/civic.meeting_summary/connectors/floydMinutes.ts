// Floyd County minutes-page connector.
//
// Parses Floyd's agendas-and-minutes listing (a Wix-rendered site) into
// a list of MeetingEntry rows. The page is server-rendered, so plain
// fetch() returns the full HTML with every meeting, PDF URL, and YouTube
// URL present — no Playwright or headless browser needed.
//
// Because the raw HTML is ~1 MB of Wix chrome, we trim it via cheerio
// before sending to Claude: drop scripts/styles/svgs/images/metadata,
// keep the primary content region, preserve <a href> attributes. Claude
// then extracts structured entries.
//
// Site-specific notes (verified live at build time):
//   - PDF URLs: https://www.floydcova.gov/_files/ugd/{bucket}_{hash}.pdf
//     where {bucket} is one of several Wix storage prefixes (49fff5_,
//     db2c48_, etc.). Validation accepts any /_files/ugd/...\.pdf URL on
//     the primary domain.
//   - YouTube URLs: canonical https://www.youtube.com/watch?v={id}.
//   - Multiple recordings per meeting are common ("Video Recording 1",
//     "Video Recording 2"). MVP summarizes only the first; the rest go
//     into additional_video_urls for display.
//   - Some meetings have no recording ("Video recording unavailable...");
//     the connector returns null source_video_url in that case.

import * as cheerio from "cheerio";
import type {
  MeetingEntry,
  MeetingSourceConnector,
  MeetingSummaryConfig,
  FetchHtmlFn,
  CallClaudeFn,
} from "../models.js";
import { buildDiscoveryPrompt } from "../prompts.js";
import { parseJsonArray } from "../pipeline.js";

const TAGS_TO_STRIP = [
  "script",
  "style",
  "noscript",
  "link",
  "meta",
  "svg",
  "img",
  "iframe",
  "picture",
  "source",
  "video",
  "audio",
  "canvas",
  "template",
  "head",
];

/**
 * Strip Wix chrome / scripts / SVGs / images; prefer <main>, fall back
 * to <body>. Preserves <a href> attributes (Claude needs them to
 * produce the PDF + YouTube URL outputs). Also drops Wix-specific
 * `data-*` attributes and stylistic attributes (class, style, id,
 * aria-*, role) — they add no information Claude needs but bloat the
 * payload by 3–5x on Wix sites.
 */
export function trimMinutesHtml(rawHtml: string): string {
  const $ = cheerio.load(rawHtml);
  for (const tag of TAGS_TO_STRIP) $(tag).remove();
  $("[aria-hidden='true']").remove();

  // Strip per-element noise attributes. Retain only `href`, `title`, and
  // `alt` on every element — everything else on a Wix page is visual
  // plumbing. This matters: a single Wix section can carry 30+ `data-`
  // attributes per tag which collectively dwarf the actual content.
  const KEEP = new Set(["href", "title", "alt"]);
  $("*").each((_i, el) => {
    if (el.type !== "tag") return;
    const attribs = (el as unknown as { attribs: Record<string, string> }).attribs;
    if (!attribs) return;
    for (const name of Object.keys(attribs)) {
      if (!KEEP.has(name)) delete attribs[name];
    }
  });

  const region = $("main").first();
  const target = region.length > 0 ? region : $("body");
  const html = target.html() ?? "";
  return collapseWhitespace(html);
}

function collapseWhitespace(html: string): string {
  return html.replace(/[ \t\r]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function bytes(s: string): string {
  const n = s.length;
  if (n > 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)}mb`;
  if (n > 1024) return `${Math.round(n / 1024)}kb`;
  return `${n}b`;
}

const FLOYD_PDF_PATTERN = /^https:\/\/www\.floydcova\.gov\/_files\/ugd\/.+\.pdf$/i;
const YOUTUBE_WATCH_PATTERN =
  /^https:\/\/(www\.)?youtube\.com\/watch\?.*v=[A-Za-z0-9_-]{11}/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isValidEntry(raw: unknown): raw is MeetingEntry {
  if (!raw || typeof raw !== "object") return false;
  const e = raw as Partial<MeetingEntry>;
  if (typeof e.meeting_title !== "string" || e.meeting_title.trim().length === 0) {
    return false;
  }
  if (typeof e.meeting_date !== "string" || !ISO_DATE_PATTERN.test(e.meeting_date)) {
    return false;
  }
  if (
    typeof e.source_minutes_url !== "string" ||
    !FLOYD_PDF_PATTERN.test(e.source_minutes_url)
  ) {
    return false;
  }
  if (
    e.source_video_url !== null &&
    (typeof e.source_video_url !== "string" ||
      !YOUTUBE_WATCH_PATTERN.test(e.source_video_url))
  ) {
    return false;
  }
  if (!Array.isArray(e.additional_video_urls)) return false;
  for (const v of e.additional_video_urls) {
    if (typeof v !== "string" || !YOUTUBE_WATCH_PATTERN.test(v)) return false;
  }
  if (typeof e.source_id !== "string" || e.source_id.trim().length === 0) {
    return false;
  }
  return true;
}

export const floydMinutesConnector: MeetingSourceConnector = {
  id: "floyd-minutes-page",
  description:
    "Floyd County Board of Supervisors agendas-and-minutes page (Wix-hosted). Parses the server-rendered HTML via Claude.",

  async discover(
    cfg: MeetingSummaryConfig,
    deps: { fetchHtml: FetchHtmlFn; callClaude: CallClaudeFn },
  ): Promise<MeetingEntry[]> {
    const rawHtml = await deps.fetchHtml(cfg.source_url);
    const trimmed = trimMinutesHtml(rawHtml);
    console.log(
      `[meeting-summary] trimmed html ${bytes(rawHtml)}→${bytes(trimmed)}`,
    );

    const prompt = buildDiscoveryPrompt({
      extraction_instructions: cfg.extraction_instructions,
      trimmed_html: trimmed,
      source_url: cfg.source_url,
    });

    const { text } = await deps.callClaude({
      model: cfg.model,
      userText: prompt,
      // 12k leaves room for ~50 entries of well-escaped JSON without
      // letting Claude slip into a 5-minute generation spree. If a
      // jurisdiction ever needs more, bump here — but note that long
      // discovery outputs are a smell: the filter prompt should be
      // doing more work.
      maxTokens: 12_000,
    });

    let parsed: unknown[];
    try {
      parsed = parseJsonArray(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "parse failed";
      throw new Error(`Discovery parse failed: ${msg}`);
    }

    const entries: MeetingEntry[] = [];
    for (const raw of parsed) {
      if (isValidEntry(raw)) {
        entries.push(raw);
      } else {
        console.warn(
          `[meeting-summary] dropping malformed entry: ${JSON.stringify(raw).slice(0, 200)}`,
        );
      }
    }
    console.log(
      `[meeting-summary] discovered ${entries.length} valid entries (from ${parsed.length} raw)`,
    );
    return entries;
  },
};
