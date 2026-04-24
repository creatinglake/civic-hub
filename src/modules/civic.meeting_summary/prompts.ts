// civic.meeting_summary module — Claude prompt templates
//
// Two prompts, both prepending the admin's extraction_instructions in a
// clearly delimited block so the admin can steer behavior without
// round-tripping through engineering. Exported as string builders so
// evals / tests can diff them.

const DEFAULT_INSTRUCTIONS = `These are official government meeting records. Produce accurate, neutral summaries. Do not speculate. When in doubt about a fact, say the minutes or transcript are unclear rather than inventing detail.`;

function instructionsBlock(raw: string): string {
  const trimmed = (raw ?? "").trim();
  const body = trimmed.length > 0 ? trimmed : DEFAULT_INSTRUCTIONS;
  return `<admin_instructions>\n${body}\n</admin_instructions>`;
}

/**
 * Prompt for the minutes-page discovery leg. The connector passes the
 * trimmed HTML of a jurisdiction's agendas-and-minutes listing page; we
 * ask Claude to enumerate every meeting entry with its PDF + YouTube
 * URLs. The response MUST be a JSON array — Claude is told to emit
 * nothing else.
 */
export function buildDiscoveryPrompt(input: {
  extraction_instructions: string;
  trimmed_html: string;
  source_url: string;
}): string {
  return `You are extracting a structured list of government meetings from an agendas-and-minutes page.

${instructionsBlock(input.extraction_instructions)}

<source_url>${input.source_url}</source_url>

<trimmed_html>
${input.trimmed_html}
</trimmed_html>

For each meeting entry visible on the page, extract:
- meeting_title: short human-readable name (e.g. "Board of Supervisors Regular Meeting", "Budget Workshop"). Do NOT include the date in this field.
- meeting_date: ISO 8601 date (YYYY-MM-DD). Infer year if missing but prefer pages where the year is explicit.
- source_minutes_url: the full https:// URL of the minutes PDF for that meeting. Must end in .pdf.
- source_video_url: the full https:// URL of the primary YouTube recording for that meeting, or null if no recording is available. If multiple recordings exist for the same meeting (e.g. "Video Recording 1" and "Video Recording 2"), this is the FIRST one.
- additional_video_urls: array of any additional YouTube URLs for the same meeting (segment 2, continuation, retry after stream drop). Empty array if only one recording exists.
- source_id: the source_minutes_url (we use the PDF URL as the canonical dedupe key).

Ignore anything that is not a specific meeting entry (site chrome, navigation, footer links, general "how to attend" instructions, unrelated pages).

Return a JSON array of entries. If the page contains no meeting entries, return []. Emit ONLY the JSON array — no prose, no markdown fences, no explanation. Your entire response MUST parse as JSON.`;
}

/**
 * Prompt for the per-meeting summarization leg. Takes the PDF (passed
 * as a native document content block at the API layer) and the YouTube
 * transcript (stringified with timestamps) and asks Claude for a list
 * of topic blocks. The response MUST be a JSON object with a `blocks`
 * array.
 *
 * When there is no transcript (video unavailable), the caller passes
 * an empty transcript string and sets `has_video: false` — this prompt
 * explicitly instructs Claude to leave start_time_seconds null in that
 * case.
 */
export function buildSummarizationPrompt(input: {
  extraction_instructions: string;
  meeting_title: string;
  meeting_date: string;
  transcript_text: string;
  has_video: boolean;
}): string {
  const videoGuidance = input.has_video
    ? `For each block, set start_time_seconds to the transcript timestamp where that topic begins (an integer number of seconds from the start of the video). Only use timestamps you can ground in the transcript.`
    : `This meeting has NO video recording. Set start_time_seconds to null on every block. Summarize from the minutes document only.`;

  const transcriptBlock = input.has_video
    ? `<transcript>\n${input.transcript_text}\n</transcript>`
    : `<transcript>(no video recording for this meeting)</transcript>`;

  return `You are summarizing a government meeting into a short list of topic blocks for citizens to read.

${instructionsBlock(input.extraction_instructions)}

<meeting>
  <title>${input.meeting_title}</title>
  <date>${input.meeting_date}</date>
</meeting>

The minutes document is attached as a PDF. Use it as the authoritative record of what was discussed and what was decided.

${transcriptBlock}

Produce a chronological list of topic blocks. Each block covers one coherent agenda item or topic of discussion. Keep summaries short and plain-spoken — residents are the audience, not lawyers.

For each block, produce:
- topic_title: a short phrase (under 12 words) naming the topic.
- topic_summary: 1–4 sentences of plain-language summary. Neutral tone. No speculation. If the minutes are unclear or contradict the transcript, say so.
- start_time_seconds: see below.
- action_taken: a single short sentence describing any concrete action, motion, vote, or decision from this block. Null if the block is discussion only.

${videoGuidance}

Aim for 4–12 blocks per meeting. Skip procedural micro-items (call to order, roll call, adjournment, etc.) unless they contain substantive content.

Return a JSON object of the form:
{
  "blocks": [
    {
      "topic_title": "...",
      "topic_summary": "...",
      "start_time_seconds": 123,
      "action_taken": "..." | null
    }
  ]
}

Emit ONLY the JSON object — no prose, no markdown fences, no explanation. Your entire response MUST parse as JSON.`;
}

/** Exposed so callers can snapshot the admin instructions used for a run. */
export function resolveEffectiveInstructions(raw: string): string {
  const trimmed = (raw ?? "").trim();
  return trimmed.length > 0 ? trimmed : DEFAULT_INSTRUCTIONS;
}
