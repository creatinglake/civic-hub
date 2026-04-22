// civic.brief module — email formatting
//
// Pure functions that turn a BriefProcessState into email subject + body
// pair. Delivery is the host hub's responsibility (see SendEmailFn in
// models.ts).

import type { BriefContent, BriefProcessState } from "./models.js";

export interface BriefEmail {
  subject: string;
  html: string;
  text: string;
}

export function formatBriefEmail(
  state: BriefProcessState,
  options: {
    hubLabel: string;           // e.g. "Floyd Civic Hub"
    publicUrl: string;          // e.g. "https://example.org/brief/abc123"
  },
): BriefEmail {
  const subject = `${options.hubLabel} — Civic Brief: ${state.content.title}`;
  return {
    subject,
    text: renderText(state, options),
    html: renderHtml(state, options),
  };
}

function renderText(
  state: BriefProcessState,
  options: { hubLabel: string; publicUrl: string },
): string {
  const c = state.content;
  const lines: string[] = [];
  lines.push(c.title);
  lines.push("=".repeat(c.title.length));
  lines.push("");
  lines.push(`Participation: ${c.participation_count} resident${c.participation_count === 1 ? "" : "s"}`);
  lines.push("");
  lines.push("Positions:");
  for (const p of c.position_breakdown) {
    lines.push(`  • ${p.option_label}: ${p.count} (${p.percentage}%)`);
  }
  if (c.concerns.length > 0) {
    lines.push("");
    lines.push("Concerns raised:");
    for (const concern of c.concerns) lines.push(`  • ${concern}`);
  }
  if (c.suggestions.length > 0) {
    lines.push("");
    lines.push("Suggestions:");
    for (const s of c.suggestions) lines.push(`  • ${s}`);
  }
  if (c.admin_notes.trim().length > 0) {
    lines.push("");
    lines.push("Notes from the Civic Hub:");
    lines.push(c.admin_notes.trim());
  }
  lines.push("");
  lines.push(`View online: ${options.publicUrl}`);
  lines.push("");
  lines.push(`— ${options.hubLabel}`);
  return lines.join("\n");
}

function renderHtml(
  state: BriefProcessState,
  options: { hubLabel: string; publicUrl: string },
): string {
  const c = state.content;
  const positions = c.position_breakdown
    .map(
      (p) =>
        `<li><strong>${escape(p.option_label)}:</strong> ${p.count} (${p.percentage}%)</li>`,
    )
    .join("");
  const concerns = c.concerns.length
    ? `<h3>Concerns raised</h3><ul>${c.concerns.map((x) => `<li>${escape(x)}</li>`).join("")}</ul>`
    : "";
  const suggestions = c.suggestions.length
    ? `<h3>Suggestions</h3><ul>${c.suggestions.map((x) => `<li>${escape(x)}</li>`).join("")}</ul>`
    : "";
  const adminNotes = c.admin_notes.trim().length
    ? `<h3>Notes from the Civic Hub</h3><p>${escape(c.admin_notes.trim()).replace(/\n/g, "<br/>")}</p>`
    : "";
  const participants = `${c.participation_count} resident${c.participation_count === 1 ? "" : "s"}`;
  return `<!doctype html>
<html><body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; color:#1a1a1a; max-width:640px; margin:0 auto; padding:24px;">
  <h1 style="font-size:22px; margin:0 0 8px;">${escape(c.title)}</h1>
  <p style="color:#555; margin:0 0 16px;">Civic Brief — ${options.hubLabel}</p>
  <p><strong>Participation:</strong> ${participants}</p>
  <h3>Positions</h3>
  <ul>${positions}</ul>
  ${concerns}
  ${suggestions}
  ${adminNotes}
  <hr style="border:none; border-top:1px solid #e5e5e5; margin:24px 0;"/>
  <p><a href="${escape(options.publicUrl)}">View this brief online</a></p>
  <p style="color:#888; font-size:12px;">— ${options.hubLabel}</p>
</body></html>`;
}

function escape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Human-readable one-liner for a brief content block, useful for logs and
 * the feed post summary.
 */
export function headlineFor(content: BriefContent): string {
  if (content.position_breakdown.length === 0 || content.participation_count === 0) {
    return "No participation recorded.";
  }
  const top = content.position_breakdown[0];
  return `${top.option_label}: ${top.count} of ${content.participation_count} (${top.percentage}%)`;
}
