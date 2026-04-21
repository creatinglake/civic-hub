import { Link } from "react-router-dom";
import type { CivicEvent } from "../services/api";

/**
 * Display model for a feed post. Constructed from a CivicEvent by the Feed
 * container — FeedPost itself does no fetching, so it stays deterministic and
 * cheap to render.
 */
export interface FeedPostView {
  id: string;
  title: string;
  summary: string;
  timestamp: string; // ISO 8601
  href: string;
}

interface Props {
  post: FeedPostView;
}

/**
 * Build the per-post view model from an event. Returns null if the event
 * isn't a renderable post type in the current slice.
 *
 * The filter map is open for extension: new process-type plugins can be
 * surfaced by adding entries here without restructuring the Feed.
 */
export function eventToPost(
  event: CivicEvent,
  getProcessDescription: (processId: string) => string | undefined,
  getProcessTitle: (processId: string) => string | undefined,
): FeedPostView | null {
  switch (event.event_type) {
    case "civic.process.created": {
      const process = (event.data as { process?: { type?: string; title?: string } }).process;
      if (!process || process.type !== "civic.vote") return null;
      const title = process.title ?? getProcessTitle(event.process_id) ?? "Untitled vote";
      return {
        id: event.id,
        title: `New vote: ${title}`,
        summary: summaryFromDescription(getProcessDescription(event.process_id)),
        timestamp: event.timestamp,
        href: event.action_url,
      };
    }

    case "civic.process.result_published": {
      const result = (event.data as {
        result?: { tally?: Record<string, number>; total_votes?: number };
      }).result;
      const total = result?.total_votes ?? 0;
      const title = getProcessTitle(event.process_id) ?? `Process ${event.process_id}`;
      const noun = total === 1 ? "participant" : "participants";
      return {
        id: event.id,
        title: `Results available: ${title}`,
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

function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  const years = Math.round(days / 365);
  return `${years} year${years === 1 ? "" : "s"} ago`;
}

function absoluteTime(iso: string): string {
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
 * Classify an action_url as either an internal SPA route or an external link.
 *
 * Events from this hub carry an action_url in the form of the hub's own
 * base URL (e.g. http://localhost:3000/process/abc). We want to render those
 * as client-side navigation to /process/abc rather than full-page jumps to
 * the API host. Federated events (future) will carry foreign origins — we
 * render those as plain external anchors.
 *
 * We treat any action_url whose pathname matches a known SPA route as
 * internal, regardless of origin. This is intentional: in dev the UI runs
 * on a different port than the API, and the hub backend currently populates
 * action_url with the API origin. A future slice should have the backend
 * emit UI-facing action URLs; see HANDOFF.md.
 */
function classifyHref(href: string): { kind: "internal"; to: string } | { kind: "external" } {
  try {
    const url = new URL(href, window.location.origin);
    if (/^\/process\/[^/]+\/?$/.test(url.pathname)) {
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

  const inner = (
    <>
      <h2 className="feed-post-title">{post.title}</h2>
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
