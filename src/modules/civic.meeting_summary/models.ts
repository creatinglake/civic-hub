// civic.meeting_summary module — type definitions
//
// A Meeting Summary is an AI-generated, admin-reviewed summary of a
// jurisdiction's official meeting (e.g. a Board of Supervisors meeting).
// The summary is produced by combining the meeting's minutes PDF with its
// YouTube auto-transcript into a structured list of topic blocks with
// timestamp links into the video recording.
//
// Meeting summaries are simultaneously:
//   - a process-type module (registered in the process registry, storing
//     state, emitting lifecycle events), and
//   - a service module (the scraper + summarizer pipeline invoked by cron).
//
// Both halves live under this folder; they're distinguished by filename:
//   service.ts    — state transitions (process-type work)
//   pipeline.ts   — cron-scraping flow (service work)
//   connectors/*  — pluggable source discovery
//
// Pluggability guardrail: this module MUST NOT import from the hub's event
// store, DB client, routes layer, or any other module (civic.vote,
// civic.brief, civic.digest, etc.). The host hub injects every effectful
// dependency. A hub that doesn't want meeting summaries simply doesn't
// register the module and doesn't mount its routes.

// --- Core data model --------------------------------------------------------

export type MeetingSummaryApprovalStatus = "pending" | "approved" | "published";

/**
 * A single topic block — one segment of the meeting. `start_time_seconds`
 * points into the YouTube recording for click-to-jump UX. `action_taken`
 * captures any motion / vote / decision distinct from the discussion.
 *
 * When the meeting has no video recording (e.g. "Video recording
 * unavailable"), `start_time_seconds` is null and the UI renders the block
 * without a clickable timestamp.
 */
export interface SummaryBlock {
  topic_title: string;
  topic_summary: string;
  start_time_seconds: number | null;
  action_taken: string | null;
}

/**
 * Process.state shape for a civic.meeting_summary process.
 *
 * The process-level `status` field (active | finalized) mirrors the
 * civic.brief convention — draft → active → finalized, with "closed" and
 * "draft" skipped because the process has no participation window. See
 * HANDOFF.md for the deviation note (cross-referenced to the existing
 * brief note).
 */
export interface MeetingSummaryProcessState {
  type: "civic.meeting_summary";

  // --- Source provenance (the "what was summarized" contract) ---
  /**
   * Canonical dedupe key produced by the connector. Typically the PDF URL,
   * but connectors may choose a stable alternative (e.g. a hash). The cron
   * looks for an existing process with this source_id before creating a
   * new summary.
   */
  source_id: string;
  /** PDF URL scraped from the minutes page. Always present. */
  source_minutes_url: string;
  /**
   * YouTube watch URL of the primary recording. Null when the meeting
   * has no video recording (e.g. streaming failure, PDF-only workshop).
   * In that case blocks carry null start_time_seconds and the public
   * page shows a modified disclaimer.
   */
  source_video_url: string | null;
  /**
   * Secondary recordings (segment 2, retry after stream drop, etc.).
   * Displayed on the public page for transparency but NOT used for
   * transcript fetch or summarization in MVP. Full-meeting coverage is
   * a future enhancement — flagged in HANDOFF.md.
   */
  additional_video_urls: string[];
  meeting_title: string;
  /** ISO 8601 date (YYYY-MM-DD). */
  meeting_date: string;

  // --- Aggregated output ---
  blocks: SummaryBlock[];

  // --- Admin review + approval tracking ---
  approval_status: MeetingSummaryApprovalStatus;
  /** ISO 8601 — pipeline completion time. */
  generated_at: string;
  approved_at: string | null;
  published_at: string | null;
  /** Optional admin-authored context; empty string on generation. */
  admin_notes: string;
  /** Null if never edited. */
  last_edited_at: string | null;
  /** Increments on each admin edit during review. */
  edit_count: number;

  // --- Provenance / reproducibility ---
  /** Snapshot of the admin extraction instructions at generation time. */
  ai_instructions_used: string;
  /** Anthropic model name, e.g. "claude-sonnet-4-5-20251022". */
  ai_model: string;
  /**
   * The "AI-generated, admin-reviewed..." disclaimer text stored with
   * the summary so federated consumers see it without relying on UI
   * chrome.
   */
  ai_attribution_label: string;
}

// --- Module inputs ----------------------------------------------------------

/** Input the pipeline passes when creating a summary from a completed run. */
export interface CreateMeetingSummaryInput {
  source_id: string;
  source_minutes_url: string;
  source_video_url: string | null;
  additional_video_urls: string[];
  meeting_title: string;
  meeting_date: string;
  blocks: SummaryBlock[];
  ai_instructions_used: string;
  ai_model: string;
}

/** Partial update body used by PATCH /admin/meeting-summaries/:id. */
export interface MeetingSummaryPatch {
  meeting_title?: string;
  blocks?: SummaryBlock[];
  admin_notes?: string;
}

// --- Context + injected callback types -------------------------------------

export interface MeetingSummaryProcessContext {
  process_id: string;
  hub_id: string;
  jurisdiction: string;
  emit: EmitEventFn;
}

export interface EmitEventFn {
  (input: {
    event_type: string;
    actor: string;
    process_id: string;
    hub_id: string;
    jurisdiction: string;
    data: Record<string, unknown>;
    action_url_path?: string;
  }): Promise<unknown>;
}

export interface FetchHtmlFn {
  (url: string): Promise<string>;
}

export interface FetchPdfFn {
  (url: string): Promise<{ bytes: Uint8Array; mime: string }>;
}

export interface TranscriptSegment {
  /** Seconds into the video. */
  start: number;
  text: string;
}

export interface FetchYouTubeTranscriptFn {
  (videoUrl: string): Promise<TranscriptSegment[]>;
}

/**
 * Low-level Claude call used by both the extraction and the summarization
 * legs. `system` is optional; `documentBase64` is provided for the
 * summarization leg to pass the PDF as a native document block. Returns
 * the assistant's raw text output plus the model id actually used (echoed
 * by the API).
 */
export interface CallClaudeFn {
  (input: {
    model: string;
    system?: string;
    userText: string;
    documentBase64?: { data: string; mediaType: string; filename?: string };
    maxTokens?: number;
  }): Promise<{ text: string; model: string }>;
}

// --- Configuration ---------------------------------------------------------

export interface MeetingSummaryConfig {
  /** Jurisdiction's minutes page URL (e.g. Floyd's agendas-minutes page). */
  source_url: string;
  /**
   * Admin-provided natural-language guidance. Prepended verbatim to the
   * Claude extraction and summarization prompts. A short built-in
   * fallback is used when this is empty.
   */
  extraction_instructions: string;
  /** Anthropic model name to use for both prompts. */
  model: string;
}

// --- Connector interface ---------------------------------------------------

/**
 * Output of a connector's discover() call. A connector enumerates every
 * meeting that exists on its source; the cron then dedupes by source_id
 * before creating processes.
 */
export interface MeetingEntry {
  meeting_title: string;
  /** ISO 8601 date (YYYY-MM-DD). */
  meeting_date: string;
  source_minutes_url: string;
  /** Null if the meeting has no video recording. */
  source_video_url: string | null;
  /** Non-empty if the meeting has multiple recordings (segment 2, etc.). */
  additional_video_urls: string[];
  /** Stable dedupe key. Typically the PDF URL. */
  source_id: string;
}

export interface MeetingSourceConnector {
  id: string;
  description: string;
  discover(
    cfg: MeetingSummaryConfig,
    deps: {
      fetchHtml: FetchHtmlFn;
      callClaude: CallClaudeFn;
    },
  ): Promise<MeetingEntry[]>;
}

// --- Pipeline output -------------------------------------------------------

export interface SummarizeMeetingResult {
  blocks: SummaryBlock[];
  ai_instructions_used: string;
  model: string;
}
