// civic.link_preview — HTML → LinkPreview parser.
//
// Reads OpenGraph, Twitter card, and HTML fallback signals. Pure
// function: takes the raw HTML body and the URL, returns a partial
// LinkPreview. The service layer wraps this with fetch + caching.

import { load } from "cheerio";
import type { LinkPreview } from "./models.js";

/**
 * Resolve a possibly-relative URL against a base. Returns null if the
 * input is empty/unparseable so the caller can decide whether to fall
 * back. Defends against `og:image` values like "/images/foo.jpg".
 */
function resolveUrl(input: string | undefined, base: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  try {
    return new URL(trimmed, base).toString();
  } catch {
    return null;
  }
}

function metaContent(
  $: ReturnType<typeof load>,
  selector: string,
): string | null {
  const v = $(selector).attr("content");
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function firstNonEmpty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function clamp(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Parse an HTML body into the OG-derived fields of a LinkPreview.
 * Caller is responsible for filling `url`, `fetched_at`, and `error`.
 */
export function parseHtmlToPreview(
  html: string,
  finalUrl: string,
): Pick<
  LinkPreview,
  "canonical_url" | "title" | "description" | "image_url" | "site_name"
> {
  const $ = load(html);

  const canonicalRaw =
    $("link[rel='canonical']").attr("href") ?? metaContent($, "meta[property='og:url']");
  const canonical_url = resolveUrl(canonicalRaw ?? undefined, finalUrl);

  const ogTitle = metaContent($, "meta[property='og:title']");
  const twTitle = metaContent($, "meta[name='twitter:title']");
  const docTitle = $("title").first().text().trim() || null;
  const title = firstNonEmpty(ogTitle, twTitle, docTitle, hostnameOf(finalUrl));

  const ogDesc = metaContent($, "meta[property='og:description']");
  const twDesc = metaContent($, "meta[name='twitter:description']");
  const metaDesc = metaContent($, "meta[name='description']");
  // Last-resort fallback: first non-empty paragraph in the article body.
  const firstP =
    $("article p, main p, body p").first().text().trim() || null;
  const descRaw = firstNonEmpty(ogDesc, twDesc, metaDesc, firstP);
  const description = descRaw ? clamp(descRaw, 200) : null;

  const ogImage = metaContent($, "meta[property='og:image']");
  const twImage = metaContent($, "meta[name='twitter:image']");
  const articleImg =
    $("article img").first().attr("src") ??
    $("main img").first().attr("src") ??
    null;
  const imageRaw = firstNonEmpty(ogImage, twImage, articleImg);
  const image_url = imageRaw ? resolveUrl(imageRaw, finalUrl) : null;

  const ogSite = metaContent($, "meta[property='og:site_name']");
  const site_name = firstNonEmpty(ogSite, hostnameOf(finalUrl));

  return { canonical_url, title, description, image_url, site_name };
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
