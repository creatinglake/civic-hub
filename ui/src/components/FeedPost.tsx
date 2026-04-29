import { Link } from "react-router-dom";
import type { CivicEvent } from "../services/api";

/**
 * Color/label kinds for the per-post type pill. Each maps to a token in
 * theme.css (--pill-<kind>-bg / --pill-<kind>-fg).
 *
 * Slice 8.5 collapsed the previous "brief" and "vote-results" kinds
 * into a single "vote-results" pill — they were rendered separately
 * before, but residents shouldn't see two posts per closed vote ("Civic
 * Brief delivered" and "Vote results published"). The new feed shows
 * exactly one "Vote results: <title>" post per closed vote, sourced
 * from the civic.vote_results process's result_published event.
 */
export type FeedPillKind =
  | "vote-open"
  | "vote-results"
  | "announcement"          // admin-authored announcements (default)
  | "announcement-author"   // non-admin author (Board, committees, etc.)
  | "meeting";

/**
 * Display model for a feed post. Constructed from a CivicEvent by the Feed
 * container — FeedPost itself does no fetching, so it stays deterministic and
 * cheap to render. Title and pill are intentionally separate fields: the
 * pill renders as its own element beside the title rather than being baked
 * into the title string.
 *
 * Slice 9 — leading visual: only renders an attached image when the
 * post has one. Cards without an image render plain (no gradient cover,
 * no OG fallback) — the per-card colored top border + pill carry the
 * type signal cheaply, and the feed stays scannable.
 */
export interface FeedPostView {
  id: string;
  title: string;
  pillLabel: string;
  pillKind: FeedPillKind;
  summary: string;
  timestamp: string; // ISO 8601
  href: string;
  imageUrl?: string | null;
  imageAlt?: string | null;
  /**
   * Slice 10 — compact engagement / metadata line rendered between the
   * summary and the timestamp. Empty / missing → suppressed entirely
   * so cards with no real engagement don't show a "0 residents voted"
   * line. The Feed container builds this from the per-process
   * metadata it already fetches lazily — see Feed.tsx::buildEngagement.
   */
  engagement?: string | null;
}

interface Props {
  post: FeedPostView;
}

/**
 * Cached process-type discriminator. The Feed container fetches process
 * detail lazily and caches the type here so eventToPost can branch
 * cleanly. Includes "civic.brief" as a legacy alias — process rows
 * still have the new type after the migration, but cached metadata or
 * federated events from older hubs may carry the old name.
 */
type FeedProcessKind =
  | "civic.vote"
  | "civic.vote_results"
  | "civic.brief" // legacy alias — normalize to "civic.vote_results"
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
        // Vote-results discriminator. Slice 8.5 emits `results_id` on
        // new events; older events emitted before the rename carry
        // `brief_id`. Either field signals "this is a vote-results
        // post". Both are accepted indefinitely so no events have to
        // be rewritten in place.
        results_id?: string;
        brief_id?: string;
        result?: { total_votes?: number };
        participation_count?: number;
        headline_result?: string;
        announcement?: {
          id?: string;
          title?: string;
          author_role?: string;
          /**
           * Slice 13 — provenance for synced-from-external announcements.
           * When `source.origin === "floyd-news"`, the card was ingested
           * by the Floyd-news-sync cron rather than authored by a hub
           * admin. We reuse the regular announcement pill color (orange
           * "Admin announcement" palette) so synced cards visually
           * group with admin-authored ones — they still match the
           * "Announcements" filter pill the same way.
           */
          source?: {
            origin?: string;
            share_url?: string;
            ingested_at?: string;
          } | null;
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
        const isAdmin = normalized === "Admin";
        // Slice 13 — synced-from-external announcements carry
        // source.origin = "floyd-news". They reuse the admin
        // announcement palette (orange) so they group with the
        // standard "Announcements" filter visually. The label still
        // reads as the syncing organization ("Floyd County
        // Government announcement") to distinguish the source.
        const isSynced = data.announcement?.source?.origin === "floyd-news";
        const pillLabel = isAdmin
          ? "Admin announcement"
          : `${normalized} announcement`;
        return {
          id: event.id,
          title,
          pillLabel,
          // Non-admin authors (Board members, committees, etc.) get a
          // distinct pill + card border color so residents can tell
          // which announcements come from elected officials vs the
          // hub administrator. Synced announcements (Floyd County
          // Government cron) use the admin palette so they don't get
          // confused with elected-official posts.
          pillKind: isAdmin || isSynced ? "announcement" : "announcement-author",
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
        // Slice 10: summary now carries the meeting date as context;
        // the engagement line below this carries the topic count +
        // duration. Splitting them avoids "12 topics covered" appearing
        // on both lines.
        void blockCount;
        const summary = meetingDate ? formatMeetingDate(meetingDate) : "";
        return {
          id: event.id,
          title,
          pillLabel: "BOS meeting summary",
          pillKind: "meeting",
          summary,
          timestamp: event.timestamp,
          href: event.action_url,
        };
      }

      // Vote results — accept either the new results_id or the legacy
      // brief_id discriminator. cachedType bridges the same naming gap
      // for stored process metadata.
      const isVoteResults =
        typeof data.results_id === "string" ||
        typeof data.brief_id === "string" ||
        cachedType === "civic.vote_results" ||
        cachedType === "civic.brief";

      if (isVoteResults) {
        const title = getProcessTitle(event.process_id) ?? "Vote results";
        // Slice 10: the summary now carries context (the headline
        // result or a "delivered to the Board" indicator), and the
        // engagement line below carries the participation count +
        // comment count. Splitting them avoids the duplication that
        // showed up when both lines said "N residents voted".
        const summary = data.headline_result
          ? String(data.headline_result)
          : "Delivered to the Board of Supervisors.";
        return {
          id: event.id,
          title,
          pillLabel: "Vote results",
          pillKind: "vote-results",
          summary,
          timestamp: event.timestamp,
          href: event.action_url,
        };
      }

      // Vote process result_published — INTENTIONALLY NOT RENDERED.
      //
      // Closing a vote with the civic.vote_results module registered
      // produces TWO result_published events: one from the vote-results
      // record (above) and one from the underlying vote (here). The
      // vote event is preserved on the event log for audit / federation
      // purposes — but residents would see two posts per close, which
      // is the redundancy Slice 8.5 was created to eliminate. Filter
      // it out by returning null. (data.result identifies the vote
      // event uniquely; vote-results events carry results_id/brief_id
      // and are caught above.)
      if (data.result !== undefined || cachedType === "civic.vote") {
        return null;
      }

      // Unknown shape — defensive fallback. A new process type emitting
      // result_published without updating this discrimination ladder
      // ends up here. Surface a minimal post rather than a crash, but
      // it's worth following up to add a proper kind.
      return null;
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
    if (/^\/vote-results\/[^/]+\/?$/.test(url.pathname)) {
      return { kind: "internal", to: url.pathname };
    }
    // Legacy /brief/:id action_urls from events emitted before Slice
    // 8.5. Routed internally so the SPA can do its <Navigate> redirect
    // to /vote-results/:id (App.tsx) rather than full-page bouncing
    // through the backend's 301.
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
  const hasImage = Boolean(post.imageUrl);
  const articleClass = `feed-post feed-post--${post.pillKind}${
    hasImage ? " has-image" : ""
  }`;

  // When an attached image exists, the card uses a side-by-side layout
  // (text left, square thumbnail right) on desktop and stacks the image
  // above with a capped height on mobile — see Feed.css. Imageless cards
  // continue to render as a single text column.
  const inner = (
    <>
      <div className="feed-post-body">
        <div className="feed-post-head">
          <h2 className="feed-post-title">{post.title}</h2>
          <span className={pillClass}>{post.pillLabel}</span>
        </div>
        {post.summary && <p className="feed-post-summary">{post.summary}</p>}
        {post.engagement && (
          <p className="feed-post-engagement">{post.engagement}</p>
        )}
        <time
          className="feed-post-time"
          dateTime={post.timestamp}
          title={absoluteTime(post.timestamp)}
        >
          {relativeTime(post.timestamp)}
        </time>
      </div>
      {hasImage && (
        <span className="feed-post-image">
          <img
            src={post.imageUrl ?? ""}
            alt={post.imageAlt ?? ""}
            loading="lazy"
            decoding="async"
          />
        </span>
      )}
    </>
  );

  return (
    <article className={articleClass}>
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
