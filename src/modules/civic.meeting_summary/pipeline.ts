// civic.meeting_summary module — cron-run pipeline
//
// Pure functions taking injected callbacks. No I/O of its own — the host
// hub wires the real fetchHtml / fetchPdf / fetchYouTubeTranscript /
// callClaude implementations (see civic-hub/src/utils/anthropic,
// youtube, http). Keeps the module portable and testable.

import type {
  CallClaudeFn,
  CreateMeetingSummaryInput,
  FetchPdfFn,
  FetchYouTubeTranscriptFn,
  MeetingEntry,
  MeetingSourceConnector,
  MeetingSummaryConfig,
  SummaryBlock,
  SummarizeMeetingResult,
  TranscriptSegment,
  FetchHtmlFn,
} from "./models.js";
import {
  buildSummarizationPrompt,
  resolveEffectiveInstructions,
} from "./prompts.js";
import { buildProcessDescription } from "./service.js";

// --- Discovery -------------------------------------------------------------

export async function discoverMeetings(
  connector: MeetingSourceConnector,
  cfg: MeetingSummaryConfig,
  deps: { fetchHtml: FetchHtmlFn; callClaude: CallClaudeFn },
): Promise<MeetingEntry[]> {
  return connector.discover(cfg, deps);
}

// --- Summarization ---------------------------------------------------------

/**
 * Fetches the minutes PDF and (if present) the YouTube transcript, then
 * asks Claude for a list of topic blocks. Returns the blocks plus the
 * snapshot of instructions used and the model name the API reported.
 *
 * Error handling is the caller's job — any thrown error aborts this one
 * meeting; the cron controller catches and continues.
 */
export async function summarizeMeeting(
  entry: MeetingEntry,
  cfg: MeetingSummaryConfig,
  deps: {
    fetchPdf: FetchPdfFn;
    fetchYouTubeTranscript: FetchYouTubeTranscriptFn;
    callClaude: CallClaudeFn;
  },
): Promise<SummarizeMeetingResult> {
  const instructions = resolveEffectiveInstructions(cfg.extraction_instructions);

  // --- Fetch PDF (required; fail fast if it 404s) ---
  const pdf = await deps.fetchPdf(entry.source_minutes_url);
  const pdfBase64 = uint8ToBase64(pdf.bytes);

  // --- Fetch transcript (optional — some meetings have no video) ---
  let transcript: TranscriptSegment[] = [];
  let hasVideo = entry.source_video_url !== null;
  if (entry.source_video_url) {
    try {
      transcript = await deps.fetchYouTubeTranscript(entry.source_video_url);
    } catch (err) {
      // Non-fatal: if the transcript endpoint fails, fall back to PDF-only
      // summarization rather than dropping the meeting entirely. Log the
      // reason via rethrow-and-catch at the controller level.
      const msg = err instanceof Error ? err.message : "unknown error";
      console.warn(
        `[meeting-summary] transcript fetch failed for ${entry.source_video_url}: ${msg} — falling back to PDF-only summary`,
      );
      hasVideo = false;
      transcript = [];
    }
  }

  const transcriptText = formatTranscript(transcript);

  const prompt = buildSummarizationPrompt({
    extraction_instructions: instructions,
    meeting_title: entry.meeting_title,
    meeting_date: entry.meeting_date,
    transcript_text: transcriptText,
    has_video: hasVideo,
  });

  const { text, model } = await deps.callClaude({
    model: cfg.model,
    userText: prompt,
    documentBase64: {
      data: pdfBase64,
      mediaType: pdf.mime || "application/pdf",
      filename: filenameFromUrl(entry.source_minutes_url) ?? "minutes.pdf",
    },
    // 8192 is generous for a dozen topic blocks; headroom for verbose PDFs.
    maxTokens: 8192,
  });

  const blocks = parseSummarizationResponse(text, hasVideo);

  return {
    blocks,
    ai_instructions_used: instructions,
    model,
  };
}

// --- Convert pipeline output → module-createState input --------------------

export function buildCreateInput(
  entry: MeetingEntry,
  summary: SummarizeMeetingResult,
): CreateMeetingSummaryInput {
  return {
    source_id: entry.source_id,
    source_minutes_url: entry.source_minutes_url,
    source_video_url: entry.source_video_url,
    additional_video_urls: entry.additional_video_urls,
    meeting_title: entry.meeting_title,
    meeting_date: entry.meeting_date,
    blocks: summary.blocks,
    ai_instructions_used: summary.ai_instructions_used,
    ai_model: summary.model,
  };
}

/** Small pipeline helper — derive a one-line feed/description blurb. */
export function buildDescription(blocks: SummaryBlock[]): string {
  return buildProcessDescription(blocks);
}

// --- Helpers ---------------------------------------------------------------

function formatTranscript(segments: TranscriptSegment[]): string {
  // Compact timestamp-prefixed lines — easier for Claude to ground
  // timestamps to topics than a full JSON dump.
  return segments
    .map((s) => {
      const t = Math.max(0, Math.floor(s.start));
      return `[${formatSeconds(t)}] ${s.text.replace(/\s+/g, " ").trim()}`;
    })
    .join("\n");
}

function formatSeconds(total: number): string {
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  if (h > 0) return `${h}:${mm}:${ss}`;
  return `${mm}:${ss}`;
}

/**
 * Node 20 has Buffer available globally; we use it for a simple, correct
 * base64 encode. (Avoiding `btoa(String.fromCharCode(...))` which chokes
 * on large buffers and non-ASCII.)
 */
function uint8ToBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function filenameFromUrl(url: string): string | null {
  try {
    const u = new URL(url);
    const last = u.pathname.split("/").filter(Boolean).pop();
    return last ?? null;
  } catch {
    return null;
  }
}

/**
 * Parse Claude's response into a list of SummaryBlock. Rejects malformed
 * or empty output by throwing — caller logs and counts as a per-meeting
 * failure.
 */
function parseSummarizationResponse(
  raw: string,
  hasVideo: boolean,
): SummaryBlock[] {
  const json = extractJsonObject(raw);
  if (!json || typeof json !== "object") {
    throw new Error("Claude response was not valid JSON");
  }
  const arr = (json as { blocks?: unknown }).blocks;
  if (!Array.isArray(arr)) {
    throw new Error("Claude response missing 'blocks' array");
  }
  const out: SummaryBlock[] = [];
  for (const raw of arr) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const topic_title =
      typeof r.topic_title === "string" ? r.topic_title.trim() : "";
    const topic_summary =
      typeof r.topic_summary === "string" ? r.topic_summary.trim() : "";
    if (topic_title.length === 0 && topic_summary.length === 0) continue;
    const start =
      hasVideo &&
      typeof r.start_time_seconds === "number" &&
      Number.isFinite(r.start_time_seconds) &&
      r.start_time_seconds >= 0
        ? Math.round(r.start_time_seconds)
        : null;
    const action =
      typeof r.action_taken === "string" && r.action_taken.trim().length > 0
        ? r.action_taken.trim()
        : null;
    out.push({
      topic_title,
      topic_summary,
      start_time_seconds: start,
      action_taken: action,
    });
  }
  if (out.length === 0) {
    throw new Error("Claude response contained no usable blocks");
  }
  return out;
}

/**
 * Tolerant JSON extractor — handles the common case where Claude wraps
 * the JSON in ```json fences despite instructions, or adds a leading/
 * trailing line. Looks for the first `{` and the last `}`.
 */
function extractJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // Fast path: raw is already valid JSON.
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through
  }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first < 0 || last <= first) return null;
  const slice = trimmed.slice(first, last + 1);
  try {
    return JSON.parse(slice);
  } catch {
    return null;
  }
}

/**
 * Shared JSON-array extractor for the discovery leg (connector calls
 * into this via the module index). Returns the parsed array or throws.
 */
export function parseJsonArray(raw: string): unknown[] {
  const trimmed = raw.trim();
  try {
    const v = JSON.parse(trimmed);
    if (Array.isArray(v)) return v;
  } catch {
    // fall through
  }
  const first = trimmed.indexOf("[");
  const last = trimmed.lastIndexOf("]");
  if (first < 0 || last <= first) {
    throw new Error("Claude response was not a JSON array");
  }
  const slice = trimmed.slice(first, last + 1);
  const v = JSON.parse(slice);
  if (!Array.isArray(v)) {
    throw new Error("Claude response was not a JSON array");
  }
  return v;
}
