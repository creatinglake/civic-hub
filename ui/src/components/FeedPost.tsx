import { Link } from "react-router-dom";
import type { CivicEvent } from "../services/api";

/**
 * Color/label kinds for the per-post type pill. Each maps to a token in
 * theme.css (--pill-<kind>-bg / --pill-<kind>-fg).
 */
export type FeedPillKind =
  | "vote-open"
  | "vote-results"
  | "brief"
  | "announcement"
  | "meeting";

/**
 * Display model for a feed post. Constructed from a CivicEvent by the Feed
 * container — FeedPost itself does no fetching, so it stays deterministic and
 * cheap to render. Title and pill are intentionally separate fields: the
 * pill renders as its own element beside the title rather than being baked
 * into the title string.
 */
export interface FeedPostView {
  id: string;
  title: string;
  pillLabel: string;
  pillKind: FeedPillKind;
  summary: string;
  timestamp: string; // ISO 8601
  href: string;
}

interface Props {
  post: FeedPostView;
}

type FeedProcessKind =
  | "civic.vote"
  | "civic.brief"
  | "civic.announcement"
  | "civic.meeting_summary";

export function eventToPost(
  event: CivicEvent,
  getProcessDescription: (processId: string) => string | undefined,
  getProcessTitle: (processId: string) => string | undefined,
  getProcessType: (processId: string) => FeedProcessKind | undefined,
): FeedPostView | null {
  switch (event.event_type) {
    case "civic.process.started": {
      // `started` fires when a process enters active participation. Today
      // only civic.vote emits this event.
      const title = getProcessTitle(event.process_id) ?? "Untitled vote";
      return {
        id: event.id,
        title,
        pillLabel: "Vote open",
        pillKind: "vote-open",
        summary: summaryFromDescription(getProcessDescription(event.process_id)),
        timestamp: event.timestamp,
        href: event.action_url,
      };
    }

    case "civic.process.result_published": {
      const data = event.data as {
        brief_id?: string;
        result?: { total_votes?: number };
        participation_count?: number;
        headline_result?: string;
        announcement?: {
          id?: string;
          title?: string;
          author_role?: string;
        };
        meeting_summary?: {
          id?: string;
          meeting_title?: string;
          meeting_date?: string;
          block_count?: number;
        };
        summary_id?: string;
        meeting_date?: string;
        meeting_title?: string;
        block_count?: number;
      };

      const cachedType = getProcessType(event.process_id);

      // Announcement — pill carries the role-aware label so the title
      // remains pure announcement content.
      if (data.announcement || cachedType === "civic.announcement") {
        const title =
          data.announcement?.title ??
          getProcessTitle(event.process_id) ??
          "Announcement";
        const rawLabel = data.announcement?.author_role;
        // Legacy "board" → "Board member"; lowercase "admin" → "Admin";
        // any other free-form label is shown verbatim ("Planning
        // Committee", etc.). Falls back to "Admin" when unset.
        const normalized =
          rawLabel === "board"
            ? "Board member"
            : rawLabel === "admin" || !rawLabel
            ? "Admin"
            : rawLabel;
        const pillLabel =
          normalized === "Admin"
            ? "Admin announcement"
            : `${normalized} announcement`;
        return {
          id: event.id,
          title,
          pillLabel,
          pillKind: "announcement",
          summary: summaryFromDescription(
            getProcessDescription(event.process_id),
          ),
          timestamp: event.timestamp,
          href: event.action_url,
        };
      }

      // Meeting summary
      const isMeetingSummary =
        data.meeting_summary !== undefined ||
        typeof data.summary_id === "string" ||
        cachedType === "civic.meeting_summary";

      if (isMeetingSummary) {
        const meetingDate =
          data.meeting_summary?.meeting_date ?? data.meeting_date ?? "";
        const blockCount =
          typeof data.meeting_summary?.block_count === "number"
            ? data.meeting_summary.block_count
            : typeof data.block_count === "number"
            ? data.block_count
            : null;
        const meetingTitle =
          data.meeting_summary?.meeting_title ??
          data.meeting_title ??
          getProcessTitle(event.process_id);
        // Title is the meeting itself — date suffix when no title is
        // available so the post is never just "Meeting".
        const title = meetingTitle
          ? meetingTitle
          : `Meeting summary — ${formatMeetingDate(meetingDate)}`;
        const noun = blockCount === 1 ? "topic" : "topics";
        const summary =
          blockCount !== null
            ? meetingDate
              ? `${formatMeetingDate(meetingDate)} · ${blockCount} ${noun} covered.`
              : `${blockCount} ${noun} covered.`
            : meetingDate
            ? formatMeetingDate(meetingDate)
            : "";
        return {
          id: event.id,
          title,
          pillLabel: "Meeting summary",
          pillKind: "meeting",
          summary,
          timestamp: event.timestamp,
          href: event.action_url,
        };
      }

      // Civic Brief
      const isBrief =
        typeof data.brief_id === "string" || cachedType === "civic.brief";

      if (isBrief) {
        const title = getProcessTitle(event.process_id) ?? "Civic Brief";
        const count = data.participation_count ?? 0;
        const noun = count === 1 ? "resident" : "residents";
        const summary = data.headline_result
          ? `${count} ${noun} — ${data.headline_result}`
          : `${count} ${noun} participated — brief delivered to the Board.`;
        return {
          id: event.id,
          title,
          pillLabel: "Civic Brief",
          pillKind: "brief",
          summary,
          timestamp: event.timestamp,
          href: event.action_url,
        };
      }

      // Vote results
      const total = data.result?.total_votes ?? 0;
      const title =
        getProcessTitle(event.process_id) ?? `Process ${event.process_id}`;
      const noun = total === 1 ? "participant" : "participants";
      return {
        id: event.id,
        title,
        pillLabel: "Vote results",
        pillKind: "vote-results",
        summary: `${total} ${noun} — results now public.`,
        timestamp: event.timestamp,
        href: event.action_url,
      };
    }

    default:
      return null;
  }
}

function summaryFromDescription(description: string | undefined): string {
  if (!description) return "";
  const firstLine = description.split(/\r?\n/).find((l) => l.trim().length > 0);
  return firstLine?.trim() ?? "";
}

/**
 * Format a YYYY-MM-DD (or full ISO) date for feed post titles. Falls back
 * to the raw string if parsing fails, so truncated or malformed dates
 * don't render as "Invalid Date".
 */
function formatMeetingDate(iso: string): string {
  if (!iso) return "(date unknown)";
  const d = iso.includes("T")
    ? new Date(iso)
    : new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/**
 * Relative time string per Slice-8 rules. < 7 days renders relative;
 * older renders as an absolute short date (e.g. "Apr 14, 2026"). The
 * full datetime is exposed via the `title` attribute by the caller.
 */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return then.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function absoluteTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const time = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${date} at ${time}`;
}

/**
 * Classify an action_url as either an internal SPA route or external link.
 * (See history note on action_url origins in the previous slice's
 * HANDOFF — backend currently emits API-origin URLs and we route any
 * known SPA pathname through React Router regardless of origin.)
 */
function classifyHref(href: string): { kind: "internal"; to: string } | { kind: "external" } {
  try {
    const url = new URL(href, window.location.origin);
    if (/^\/process\/[^/]+\/?$/.test(url.pathname)) {
      return { kind: "internal", to: url.pathname };
    }
    if (/^\/brief\/[^/]+\/?$/.test(url.pathname)) {
      return { kind: "internal", to: url.pathname };
    }
    if (/^\/announcement\/[^/]+\/?$/.test(url.pathname)) {
      return { kind: "internal", to: url.pathname };
    }
    if (/^\/meeting-summary\/[^/]+\/?$/.test(url.pathname)) {
      return { kind: "internal", to: url.pathname };
    }
    if (url.origin === window.location.origin) {
      return { kind: "internal", to: url.pathname + url.search };
    }
    return { kind: "external" };
  } catch {
    return { kind: "external" };
  }
}

export default function FeedPost({ post }: Props) {
  const classified = classifyHref(post.href);
  const pillClass = `feed-pill feed-pill--${post.pillKind}`;

  const inner = (
    <>
      <div className="feed-post-head">
        <h2 className="feed-post-title">{post.title}</h2>
        <span className={pillClass}>{post.pillLabel}</span>
      </div>
      {post.summary && <p className="feed-post-summary">{post.summary}</p>}
      <time
        className="feed-post-time"
        dateTime={post.timestamp}
        title={absoluteTime(post.timestamp)}
      >
        {relativeTime(post.timestamp)}
      </time>
    </>
  );

  return (
    <article className="feed-post">
      {classified.kind === "internal" ? (
        <Link to={classified.to} className="feed-post-link">
          {inner}
        </Link>
      ) : (
        <a
          href={post.href}
          className="feed-post-link"
          target="_blank"
          rel="noopener noreferrer"
        >
          {inner}
        </a>
      )}
    </article>
  );
}
