// civic.digest/service.ts — pure assembly + formatting.
//
// Stateless: no DB, no env, no network. The caller passes the user, the
// list of already-filtered events, and hub context. The service returns
// a fully-formed DigestEmail ready to hand to the mailer, or null when
// the user has no new activity to report.

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
    announcement?: { title?: unknown; body_preview?: unknown };
    brief_id?: unknown;
    headline_result?: unknown;
    participation_count?: unknown;
    result?: { total_votes?: unknown };
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

  switch (kind) {
    case "vote_opened": {
      title = rawTitle ?? "New vote open";
      summary = "New vote now open — cast your ballot.";
      break;
    }
    case "vote_result_published": {
      const total =
        typeof d?.result?.total_votes === "number" ? d.result.total_votes : 0;
      const noun = total === 1 ? "participant" : "participants";
      title = rawTitle ?? "Vote results published";
      summary = `Results published · ${total} ${noun}.`;
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
      break;
    }
    case "announcement": {
      const preview =
        typeof d?.announcement?.body_preview === "string"
          ? d.announcement.body_preview
          : "";
      title = rawTitle ?? "New announcement";
      summary = truncate(preview, 160);
      break;
    }
  }

  return {
    kind,
    title,
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
  announcement: "Announcements",
};

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
    sections.push(renderGroupHtml(GROUP_LABELS[kind], group));
  }

  return `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#ffffff;">
    <h1 style="font-size:20px;font-weight:600;margin:0 0 8px;color:#1e3a5f;">${escapeHtml(hub.hub_name)}</h1>
    <p style="font-size:13px;color:#888;margin:0 0 24px;">${escapeHtml(subject)}</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 16px;">Hello from ${escapeHtml(hub.hub_name)},</p>
    <p style="font-size:15px;line-height:1.5;margin:0 0 24px;">Here's what's new since your last update.</p>
    ${sections.join("\n")}
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:32px 0 16px;" />
    <p style="font-size:12px;color:#888;line-height:1.6;margin:0;">
      <a href="${escapeAttr(hub.unsubscribe_url)}" style="color:#2c7be5;">Unsubscribe from this digest</a>
      &nbsp;·&nbsp;
      <a href="${escapeAttr(hub.manage_subscriptions_url)}" style="color:#2c7be5;">Manage subscriptions</a>
    </p>
    <p style="font-size:12px;color:#888;margin:12px 0 0;">${escapeHtml(hub.postal_address)}</p>
  </div>
</body>
</html>`;
}

function renderGroupHtml(label: string, items: DigestItem[]): string {
  // The title itself is the click target — no separate "Read more" link.
  // Keeping a single anchor per item makes the email skimmable and cuts
  // visual clutter when there are several rows.
  const rows = items
    .map(
      (item) => `
        <li style="margin:0 0 14px;padding:0;list-style:none;">
          <a href="${escapeAttr(item.action_url)}" style="color:#1e3a5f;text-decoration:none;font-weight:600;font-size:15px;line-height:1.35;display:inline-block;">${escapeHtml(item.title)}</a>
          ${
            item.summary
              ? `<div style="font-size:13px;color:#555;line-height:1.45;margin:3px 0 0;">${escapeHtml(item.summary)}</div>`
              : ""
          }
        </li>
      `,
    )
    .join("");

  return `
    <section style="margin:0 0 24px;">
      <h2 style="font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:#555;margin:0 0 12px;">${escapeHtml(label)}</h2>
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
        // Plain-text counterpart of the single-link HTML: title on one
        // line, then the URL on the next line so email clients
        // auto-linkify it. Summary sits between them when present.
        const body = item.summary ? `\n  ${item.summary}` : "";
        return `• ${item.title}${body}\n  ${item.action_url}`;
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
