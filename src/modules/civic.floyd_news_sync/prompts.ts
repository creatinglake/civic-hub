// civic.floyd_news_sync — Claude prompt template
//
// Single prompt: discovery from the trimmed listing-page HTML. The
// response is a JSON array of FloydNewsEntry objects. Date-filtering
// happens in our code (not Claude) so it's auditable and easily
// tunable.

export function buildDiscoveryPrompt(input: {
  trimmed_html: string;
  source_url: string;
  today_iso: string; // YYYY-MM-DD, server-local
}): string {
  return `You are extracting a structured list of recent posts from a government news / announcements page.

Page URL: ${input.source_url}
Today's date (server-local): ${input.today_iso}

For EACH visible post, extract:
- title: the post headline as plain text. Strip leading/trailing whitespace. <= 200 chars.
- share_url: the post's permanent URL. MUST match this exact shape: https://www.floydcova.gov/post/<slug>. No query params, no fragments, no trailing slash.
- image_url: the post's primary image URL if visible (typically a Wix CDN URL like https://static.wixstatic.com/media/...). Use the ORIGINAL image URL, not a thumbnail variant. If the listing only shows a thumbnail-sized URL and you cannot identify the original, return that thumbnail URL anyway. Null only if the post has no image at all.
- event_date: ISO 8601 date (YYYY-MM-DD) of the EVENT the post is announcing, when it can be reliably extracted from the title or URL slug. Examples:
    - "Board of Supervisors Meeting 04/28/2026" → "2026-04-28"
    - URL ".../board-of-supervisors-meeting-04-28-2026" → "2026-04-28"
    - "Lawn Care Bid" (no date in title or slug) → null
    - "Burn Ban — no burning until further notice" → null (open-ended)
    - "Christmas Parade December 14" with no year given → null (don't guess the year)
  Only return a date when YOU CAN VERIFY it from text on the page. Never guess. Never extract the publication date or "X days ago" timestamp — only the event date.

Output a JSON array. ONLY the array. No prose, no markdown fences, no explanation.

If the page has no extractable posts, return [].

STRICT JSON RULES — your response must parse cleanly:
- Emit ONLY the JSON array. No "Here are the entries:" preamble.
- Every string value MUST be a single-line string. No literal newlines inside strings.
- Escape internal double-quotes as \\".
- Escape backslashes as \\\\ .
- No trailing commas after the last element.
- Do NOT include any keys not listed above.
- event_date must be either null or a string matching /^\\d{4}-\\d{2}-\\d{2}$/.

Cap the response to at most 50 entries. If the page has more, return the most recent 50 (top of the listing first).

Trimmed HTML:
${input.trimmed_html}`;
}
