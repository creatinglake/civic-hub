// civic.digest/service.ts — pure assembly + formatting.
//
// Stateless: no DB, no env, no network. The caller passes the user, the
// list of already-filtered events, and hub context. The service returns
// a fully-formed DigestEmail ready to hand to the mailer, or null when
// the user has no new activity to report.
//
// Email rendering mirrors the web feed (Slice 8): title-first per item,
// a colored pill on the right indicating the post type, and a 1-line
// summary below. Pill colors are inlined as hex literals — email clients
// don't read CSS variables — and intentionally match the --pill-*
// tokens defined in the UI's theme.css.

import {
  classifyItemKind,
  isDigestRenderable,
  sortDigestItems,
} from "./filter.js";
import type {
  DigestAssemblyInput,
  DigestEmail,
  DigestEvent,
  DigestHubContext,
  DigestItem,
  DigestItemKind,
} from "./models.js";

// --- Assembly ---------------------------------------------------------------

/**
 * Turn a user + a list of events into a ready-to-send digest email.
 * Returns null when nothing survives filtering — the caller skips the
 * send and does NOT advance `last_digest_sent_at`.
 *
 * Events are assumed to be scoped to the user's "since" window already;
 * this function applies the digest-renderable filter as a second layer
 * of defense.
 */
export function assembleDigestForUser(
  input: DigestAssemblyInput,
): DigestEmail | null {
  const titles = input.process_titles ?? {};
  const items: DigestItem[] = [];
  for (const event of input.events) {
    if (!isDigestRenderable(event)) continue;
    const kind = classifyItemKind(event);
    if (!kind) continue;
    items.push(eventToItem(event, kind, titles));
  }

  if (items.length === 0) return null;

  const sorted = sortDigestItems(items);
  const subject = buildSubject(input.hub, sorted.length, new Date());
  const html = formatDigestHtml(sorted, input.hub, subject);
  const text = formatDigestText(sorted, input.hub, subject);

  return {
    user_id: input.user.id,
    to: input.user.email,
    subject,
    html,
    text,
    item_count: sorted.length,
  };
}

function eventToItem(
  event: DigestEvent,
  kind: DigestItemKind,
  titles: Record<string, string>,
): DigestItem {
  const d = event.data as {
    process?: { title?: unknown };
    announcement?: { title?: unknown; body_preview?: unknown; author_role?: unknown };
    brief_id?: unknown;
    headline_result?: unknown;
    participation_count?: unknown;
    result?: { total_votes?: unknown };
    meeting_summary?: {
      meeting_title?: unknown;
      meeting_date?: unknown;
      block_count?: unknown;
    };
    meeting_title?: unknown;
    meeting_date?: unknown;
    block_count?: unknown;
  };

  // Prefer the event payload (authoritative at emit-time); fall back to
  // the caller-supplied process_titles map (covers civic.vote and
  // civic.brief events, whose emitted payloads don't include the title).
  // Last-ditch: a generic label so the digest still renders.
  const rawTitle =
    (typeof d?.announcement?.title === "string" && d.announcement.title) ||
    (typeof d?.process?.title === "string" && d.process.title) ||
    (event.process_id && titles[event.process_id]) ||
    null;

  let title: string;
  let summary: string;
  let pill_label: string;

  switch (kind) {
    case "vote_opened": {
      title = rawTitle ?? "New vote open";
      summary = "New vote now open — cast your ballot.";
      pill_label = "Vote open";
      break;
    }
    case "vote_result_published": {
      const total =
        typeof d?.result?.total_votes === "number" ? d.result.total_votes : 0;
      const noun = total === 1 ? "participant" : "participants";
      title = rawTitle ?? "Vote results published";
      summary = `Results published · ${total} ${noun}.`;
      pill_label = "Vote results";
      break;
    }
    case "brief_published": {
      const count =
        typeof d?.participation_count === "number"
          ? d.participation_count
          : 0;
      const noun = count === 1 ? "resident" : "residents";
      const headline =
        typeof d?.headline_result === "string" ? d.headline_result : "";
      title = rawTitle ?? "Civic Brief";
      summary = headline
        ? `Civic Brief delivered · ${count} ${noun} — ${headline}`
        : `Civic Brief delivered · ${count} ${noun} participated.`;
      pill_label = "Civic Brief";
      break;
    }
    case "announcement": {
      const preview =
        typeof d?.announcement?.body_preview === "string"
          ? d.announcement.body_preview
          : "";
      title = rawTitle ?? "New announcement";
      summary = truncate(preview, 160);
      // Match the feed's role-aware pill: legacy "board" normalizes to
      // "Board member"; admin always reads "Admin announcement"; any
      // other free-form label suffixes "announcement".
      const rawRole =
        typeof d?.announcement?.author_role === "string"
          ? d.announcement.author_role
          : null;
      // Match the feed's normalization: legacy lowercase "admin" and
      // missing role both become "Admin"; "board" becomes "Board
      // member"; anything else is rendered verbatim.
      const normalized =
        rawRole === "board"
          ? "Board member"
          : rawRole === "admin" || !rawRole
          ? "Admin"
          : rawRole;
      pill_label =
        normalized === "Admin"
          ? "Admin announcement"
          : `${normalized} announcement`;
      break;
    }
    case "meeting_summary_published": {
      const meetingDate =
        (typeof d?.meeting_summary?.meeting_date === "string" &&
          d.meeting_summary.meeting_date) ||
        (typeof d?.meeting_date === "string" && d.meeting_date) ||
        "";
      const meetingTitle =
        (typeof d?.meeting_summary?.meeting_title === "string" &&
          d.meeting_summary.meeting_title) ||
        (typeof d?.meeting_title === "string" && d.meeting_title) ||
        rawTitle ||
        "Board meeting";
      const blockCount =
        typeof d?.meeting_summary?.block_count === "number"
          ? d.meeting_summary.block_count
          : typeof d?.block_count === "number"
          ? d.block_count
          : 0;
      const dateLabel = formatMeetingDate(meetingDate);
      const topicsNoun = blockCount === 1 ? "topic" : "topics";
      title = meetingTitle;
      summary = `${dateLabel} · ${blockCount} ${topicsNoun} covered.`;
      pill_label = "Meeting summary";
      break;
    }
  }

  return {
    kind,
    title,
    pill_label,
    summary,
    action_url: event.action_url,
    timestamp: event.timestamp,
  };
}

// --- Subject ----------------------------------------------------------------

function buildSubject(
  hub: DigestHubContext,
  itemCount: number,
  now: Date,
): string {
  const dateLabel = now.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  const noun = itemCount === 1 ? "new item" : "new items";
  return `${hub.hub_name} — ${dateLabel} update (${itemCount} ${noun})`;
}

// --- HTML formatting --------------------------------------------------------

const GROUP_LABELS: Record<DigestItemKind, string> = {
  vote_opened: "New votes open",
  vote_result_published: "New results published",
  brief_published: "New Civic Briefs",
  meeting_summary_published: "New meeting summaries",
  announcement: "Announcements",
};

/**
 * Per-kind pill background/foreground hex pairs. Mirrors the
 * --pill-<kind>-bg / --pill-<kind>-fg tokens in the UI's theme.css.
 * Inlined as literals because email clients don't honor CSS vars.
 */
const PILL_COLORS: Record<DigestItemKind, { bg: string; fg: string }> = {
  vote_opened:                { bg: "#e0ecfc", fg: "#1e3a5f" },
  vote_result_published:      { bg: "#d6e4f7", fg: "#15325a" },
  brief_published:            { bg: "#d4ede8", fg: "#0f5a55" },
  meeting_summary_published:  { bg: "#d9ecd9", fg: "#0f4a26" },
  announcement:               { bg: "#fbe5d3", fg: "#8c3210" },
};

const FONT_BODY =
  "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
const FONT_HEADING =
  "Fraunces, Georgia, 'Times New Roman', serif";

export function formatDigestHtml(
  items: DigestItem[],
  hub: DigestHubContext,
  subject: string,
): string {
  const grouped = groupByKind(items);
  const sections: string[] = [];
  for (const kind of Object.keys(GROUP_LABELS) as DigestItemKind[]) {
    const group = grouped.get(kind);
    if (!group || group.length === 0) continue;
    sections.push(renderGroupHtml(GROUP_LABELS[kind], group, kind));
  }

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#fafaf7;font-family:${FONT_BODY};color:#1a1a1a;">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px;background:#ffffff;">
    <h1 style="font-family:${FONT_HEADING};font-size:24px;font-weight:600;margin:0 0 8px;color:#1e3a5f;letter-spacing:-0.005em;">${escapeHtml(hub.hub_name)}</h1>
    <p style="font-size:13px;color:#8a8a8a;margin:0 0 24px;">${escapeHtml(subject)}</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 16px;">Hello from ${escapeHtml(hub.hub_name)},</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 24px;">Here's what's new since your last update.</p>
    ${sections.join("\n")}
    <hr style="border:none;border-top:1px solid #e5e5e0;margin:32px 0 16px;" />
    <p style="font-size:12px;color:#8a8a8a;line-height:1.6;margin:0;">
      <a href="${escapeAttr(hub.unsubscribe_url)}" style="color:#2c7be5;">Unsubscribe from this digest</a>
      &nbsp;·&nbsp;
      <a href="${escapeAttr(hub.manage_subscriptions_url)}" style="color:#2c7be5;">Manage subscriptions</a>
    </p>
    <p style="font-size:12px;color:#8a8a8a;margin:12px 0 0;">${escapeHtml(hub.postal_address)}</p>
  </div>
</body>
</html>`;
}

function renderGroupHtml(
  label: string,
  items: DigestItem[],
  kind: DigestItemKind,
): string {
  const { bg, fg } = PILL_COLORS[kind];
  // Each row uses a 2-cell table so the pill aligns against the right
  // edge across email clients. Inline styles only — Outlook and Gmail
  // strip <style> blocks. Title is the click target.
  const rows = items
    .map(
      (item) => `
        <li style="margin:0 0 18px;padding:0;list-style:none;">
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
            <tr>
              <td valign="top" style="padding:0 12px 0 0;">
                <a href="${escapeAttr(item.action_url)}" style="font-family:${FONT_HEADING};color:#1a1a1a;text-decoration:none;font-weight:600;font-size:18px;line-height:1.25;display:inline-block;">${escapeHtml(item.title)}</a>
              </td>
              <td valign="top" align="right" style="white-space:nowrap;">
                <span style="display:inline-block;background:${bg};color:${fg};font-family:${FONT_BODY};font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;padding:3px 10px;border-radius:9999px;">${escapeHtml(item.pill_label)}</span>
              </td>
            </tr>
          </table>
          ${
            item.summary
              ? `<div style="font-family:${FONT_BODY};font-size:14px;color:#595959;line-height:1.5;margin:6px 0 0;">${escapeHtml(item.summary)}</div>`
              : ""
          }
        </li>
      `,
    )
    .join("");

  return `
    <section style="margin:0 0 28px;">
      <h2 style="font-family:${FONT_BODY};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:#595959;margin:0 0 14px;">${escapeHtml(label)}</h2>
      <ul style="margin:0;padding:0;">${rows}</ul>
    </section>
  `;
}

// --- Plain-text formatting --------------------------------------------------

export function formatDigestText(
  items: DigestItem[],
  hub: DigestHubContext,
  subject: string,
): string {
  const grouped = groupByKind(items);
  const sections: string[] = [];
  for (const kind of Object.keys(GROUP_LABELS) as DigestItemKind[]) {
    const group = grouped.get(kind);
    if (!group || group.length === 0) continue;
    const label = GROUP_LABELS[kind].toUpperCase();
    const rows = group
      .map((item) => {
        // Plain-text counterpart: pill label trails the title in
        // brackets so the type signal still travels.
        const body = item.summary ? `\n  ${item.summary}` : "";
        return `• ${item.title} [${item.pill_label}]${body}\n  ${item.action_url}`;
      })
      .join("\n\n");
    sections.push(`${label}\n${"-".repeat(label.length)}\n${rows}`);
  }

  return [
    hub.hub_name,
    subject,
    "",
    `Hello from ${hub.hub_name},`,
    "",
    "Here's what's new since your last update.",
    "",
    sections.join("\n\n"),
    "",
    "---",
    `Unsubscribe: ${hub.unsubscribe_url}`,
    `Manage subscriptions: ${hub.manage_subscriptions_url}`,
    hub.postal_address,
  ].join("\n");
}

// --- Helpers ----------------------------------------------------------------

function groupByKind(items: DigestItem[]): Map<DigestItemKind, DigestItem[]> {
  const out = new Map<DigestItemKind, DigestItem[]>();
  for (const item of items) {
    const list = out.get(item.kind) ?? [];
    list.push(item);
    out.set(item.kind, list);
  }
  return out;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

/**
 * Format a YYYY-MM-DD meeting date for digest subjects/items. Falls back
 * to the raw string if parsing fails.
 */
function formatMeetingDate(iso: string): string {
  if (!iso) return "(date unknown)";
  const d = iso.includes("T")
    ? new Date(iso)
    : new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
