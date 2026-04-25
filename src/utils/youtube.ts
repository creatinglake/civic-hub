// YouTube helpers — transcript fetch + video-id extraction.
//
// Two transcript paths, picked at call time based on env vars:
//
// 1) SearchAPI.io (preferred when SEARCHAPI_API_KEY is set).
//    Wraps "give me transcripts for this YouTube URL" into one HTTPS
//    call. The service runs from residential IPs so YouTube's anti-
//    scraping defenses don't challenge it. This is the production
//    path on Vercel — Vercel's cloud IPs get captcha-challenged when
//    they hit YouTube directly.
//
// 2) `youtube-transcript` library (fallback when no SearchAPI key).
//    Consumes YouTube's public `timedtext` endpoint directly — works
//    from residential IPs (local dev) but typically fails on cloud
//    hosts. Kept around so dev / non-Vercel hosts still work.
//
// Either way the pipeline catches transcript failures and falls back to
// PDF-only summarization (with a warning log) — a transcript outage
// degrades quality, never breaks the run.

// The `youtube-transcript` package declares "type": "module" but its
// "main" entry is a CJS-style bundle with `exports.X = ...` assignments,
// which Node cannot expose as named ESM imports. Pointing at the ESM
// build directly is the robust workaround and survives package updates
// so long as the ESM file name stays stable.
// @ts-expect-error — deep import has no declaration file; see above
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

const SEARCHAPI_TIMEOUT_MS = 60_000;

/**
 * Fetch the auto-transcript for a YouTube watch URL. Throws on any
 * error (no transcript available, video private, endpoint changed
 * upstream). Callers catch and treat as "no transcript."
 *
 * Routes through SearchAPI.io when SEARCHAPI_API_KEY is set; falls back
 * to the unofficial youtube-transcript library otherwise. The fallback
 * works in local dev but typically fails on cloud hosts (Vercel etc.)
 * because YouTube blocks programmatic access from data-center IPs.
 */
export async function fetchYouTubeTranscript(
  watchUrl: string,
): Promise<TranscriptSegment[]> {
  const id = extractVideoId(watchUrl);
  if (!id) {
    throw new Error(`Invalid YouTube watch URL: ${watchUrl}`);
  }

  const key = process.env.SEARCHAPI_API_KEY?.trim();
  if (key) {
    return fetchViaSearchApi(id, key);
  }
  return fetchViaLibrary(id);
}

/**
 * Hit SearchAPI's youtube_transcripts engine. Documented response shape
 * (as of 2026-04):
 *
 *   {
 *     "transcripts": [
 *       { "text": "...", "start": 0.5, "duration": 2.3 },
 *       ...
 *     ]
 *   }
 *
 * The endpoint can return additional metadata fields we ignore. Time
 * values are in seconds (floats); we round `start` to integer seconds
 * to match the rest of our pipeline.
 */
async function fetchViaSearchApi(
  videoId: string,
  apiKey: string,
): Promise<TranscriptSegment[]> {
  const url = new URL("https://www.searchapi.io/api/v1/search");
  url.searchParams.set("engine", "youtube_transcripts");
  url.searchParams.set("video_id", videoId);
  url.searchParams.set("lang", "en");

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), SEARCHAPI_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        `SearchAPI transcript fetch exceeded ${SEARCHAPI_TIMEOUT_MS}ms — aborted`,
      );
    }
    throw err;
  } finally {
    clearTimeout(t);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `SearchAPI ${res.status}: ${body.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as {
    transcripts?: Array<{ text?: unknown; start?: unknown }>;
    error?: string;
  };

  if (data.error) {
    throw new Error(`SearchAPI error: ${data.error}`);
  }

  const raw = Array.isArray(data.transcripts) ? data.transcripts : [];
  const out: TranscriptSegment[] = [];
  for (const seg of raw) {
    const text = typeof seg.text === "string" ? seg.text : "";
    if (text.trim().length === 0) continue;
    const start =
      typeof seg.start === "number" && Number.isFinite(seg.start) && seg.start >= 0
        ? Math.max(0, Math.round(seg.start))
        : 0;
    out.push({ start, text });
  }
  return out;
}

const LIBRARY_TIMEOUT_MS = 30_000;

/**
 * Fallback path — uses the unofficial library. Works locally; usually
 * fails on Vercel (YouTube anti-bot challenges cloud IPs). The library
 * can hang silently when YouTube returns a captcha challenge instead of
 * a real error, so we wrap it in a hard 30-second timeout — better to
 * report "no transcript" and move on than to burn the whole Vercel
 * function budget on a single hung fetch.
 */
async function fetchViaLibrary(videoId: string): Promise<TranscriptSegment[]> {
  const raw = await Promise.race([
    YoutubeTranscript.fetchTranscript(videoId, { lang: "en" }),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `youtube-transcript library exceeded ${LIBRARY_TIMEOUT_MS}ms — likely cloud-IP block; set SEARCHAPI_API_KEY to use the SearchAPI path instead`,
            ),
          ),
        LIBRARY_TIMEOUT_MS,
      ),
    ),
  ]);
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
