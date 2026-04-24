// YouTube helpers — transcript fetch + video-id extraction.
//
// Uses the unofficial `youtube-transcript` library (no API key required)
// which consumes YouTube's public `timedtext` endpoint. This endpoint is
// not part of the official YouTube Data API v3 — the official path
// (`captions.download`) requires OAuth2 and is unworkable for a server-
// side cron.
//
// Fragility notice: the public `timedtext` endpoint can change without
// notice. If it breaks, the per-meeting pipeline logs the failure and
// falls back to PDF-only summarization rather than crashing the whole
// cron run. Flagged in HANDOFF.md.
//
// YOUTUBE_API_KEY env var is reserved for a future slice that wants to
// validate video existence or pull metadata via the official API; it's
// unused in MVP.

// The `youtube-transcript` package declares "type": "module" but its
// "main" entry is a CJS-style bundle with `exports.X = ...` assignments,
// which Node cannot expose as named ESM imports. Pointing at the ESM
// build directly is the robust workaround and survives package updates
// so long as the ESM file name stays stable.
// eslint-disable-next-line import/no-unresolved
import { YoutubeTranscript } from "youtube-transcript/dist/youtube-transcript.esm.js";
import type { TranscriptSegment } from "../modules/civic.meeting_summary/index.js";

/**
 * Extract the 11-char video id from a watch URL. Returns null on
 * anything that doesn't look like a standard watch URL.
 */
export function extractVideoId(watchUrl: string): string | null {
  try {
    const u = new URL(watchUrl);
    // youtube.com/watch?v=...
    const v = u.searchParams.get("v");
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
    // youtu.be/{id}
    if (/^(www\.)?youtu\.be$/i.test(u.hostname)) {
      const id = u.pathname.replace(/^\//, "").split("/")[0] ?? "";
      if (/^[A-Za-z0-9_-]{11}$/.test(id)) return id;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Fetch the auto-transcript for a YouTube watch URL. Throws on any
 * error (no transcript available, video private, endpoint changed
 * upstream). Callers catch and treat as "no transcript."
 */
export async function fetchYouTubeTranscript(
  watchUrl: string,
): Promise<TranscriptSegment[]> {
  const id = extractVideoId(watchUrl);
  if (!id) {
    throw new Error(`Invalid YouTube watch URL: ${watchUrl}`);
  }
  // library's response type: { text, duration, offset } where offset
  // is in milliseconds.
  const raw = await YoutubeTranscript.fetchTranscript(id, { lang: "en" });
  const out: TranscriptSegment[] = [];
  for (const seg of raw) {
    const text = typeof seg.text === "string" ? seg.text : "";
    const offset =
      typeof seg.offset === "number" && Number.isFinite(seg.offset)
        ? seg.offset
        : 0;
    if (text.trim().length === 0) continue;
    out.push({
      start: Math.max(0, Math.round(offset / 1000)),
      text,
    });
  }
  return out;
}
