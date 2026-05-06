import { Process } from "../../models/process.js";
import { ActivityStreamsObject } from "./models.js";
import { AP_CONTEXT, AP_PUBLIC } from "./context.js";
import { uiBaseUrl, baseUrl } from "../../utils/baseUrl.js";

const CIVIC_TYPE_MAP: Record<string, string> = {
  "civic.vote": "Vote",
  "civic.proposal": "Proposal",
  "civic.vote_results": "VoteResults",
  "civic.announcement": "Announcement",
  "civic.meeting_summary": "MeetingSummary",
};

function mapCivicType(processType: string): string {
  return CIVIC_TYPE_MAP[processType] ?? processType.replace("civic.", "");
}

function renderContentHtml(process: Process): string {
  const parts: string[] = [];
  const type = process.definition.type;

  if (process.content?.core_question && process.content.core_question !== process.description) {
    parts.push(`<p><strong>${escapeHtml(process.content.core_question)}</strong></p>`);
  }

  if (process.description) {
    parts.push(`<p>${escapeHtml(process.description)}</p>`);
  }

  const state = process.state as Record<string, unknown>;

  if (type === "civic.vote" && Array.isArray(state.options)) {
    const options = state.options as (string | { label: string })[];
    parts.push(`<p>Status: ${escapeHtml(process.status)}</p>`);
    parts.push("<ul>");
    for (const opt of options) {
      const label = typeof opt === "string" ? opt : opt.label;
      parts.push(`<li>${escapeHtml(label)}</li>`);
    }
    parts.push("</ul>");
  }

  if (type === "civic.announcement") {
    const body = (state.announcement as { body?: string })?.body;
    if (body) {
      parts.push(`<p>${escapeHtml(body)}</p>`);
    }
  }

  if (type === "civic.meeting_summary") {
    const blocks = state.blocks as { heading?: string; body?: string }[] | undefined;
    if (blocks && blocks.length > 0) {
      const first = blocks[0];
      if (first.heading) parts.push(`<p><strong>${escapeHtml(first.heading)}</strong></p>`);
      if (first.body) parts.push(`<p>${escapeHtml(first.body.slice(0, 300))}…</p>`);
    }
  }

  if (parts.length === 0) {
    parts.push(`<p>${escapeHtml(process.title)}</p>`);
  }

  return parts.join("\n");
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function processToActivityPub(
  process: Process,
  hubActorId: string,
  hubBaseUrl: string,
): ActivityStreamsObject {
  const apId = `${hubBaseUrl}/process/${process.id}`;
  // UI URL: strip /api suffix from BASE_URL so clicks land on the SPA, not the API
  const uiOrigin = baseUrl().replace(/\/api$/, "");
  const humanUrl = `${uiOrigin}/process/${process.id}`;

  return {
    "@context": AP_CONTEXT,
    id: apId,
    type: ["Note", `civic:${mapCivicType(process.definition.type)}`],
    summary: process.title ?? "",
    content: renderContentHtml(process),
    attributedTo: hubActorId,
    published: process.createdAt,
    updated: process.updatedAt !== process.createdAt ? process.updatedAt : undefined,
    url: humanUrl,
    to: [AP_PUBLIC],
  };
}
