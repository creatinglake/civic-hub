import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  type CivicEvent,
  type VoteState,
  getAnnouncement,
  getEvents,
  getMeetingSummary,
  getProcessState,
  getPublicVoteResults,
} from "../services/api";
import FeedPost, {
  eventToPost,
  relativeTime,
  type FeedPillKind,
  type FeedPostView,
} from "./FeedPost";
import "./Feed.css";

const PAGE_SIZE = 50;

interface Props {
  /**
   * Optional filter predicate applied before pagination. The Slice 10
   * <FeedFilter> component composes one of these from the URL `?type=`
   * param. When undefined, all events are shown.
   */
  filter?: (event: CivicEvent) => boolean;
  /**
   * Slice 10 — when a filter is active and yields zero matches, render
   * a scoped empty state with this action (typically "Show all
   * activity" → reset). Pass `null` to suppress the action button
   * entirely (used when the active filter is "all" — caller never
   * passes the action in that case).
   */
  emptyFilteredAction?: { label: string; onClick: () => void } | null;
}

type ProcessKind =
  | "civic.vote"
  | "civic.vote_results"
  | "civic.announcement"
  | "civic.meeting_summary";

interface ProcessMeta {
  type?: ProcessKind;
  title?: string;
  description?: string;
  /**
   * Slice 9 — the post's attached image (if any). When set, the feed
   * card uses it as a leading visual; when unset, the card renders
   * plain (no gradient cover, no OG fallback).
   */
  imageUrl?: string | null;
  imageAlt?: string | null;
  /**
   * Slice 10 — engagement counts surfaced as a metadata line on the
   * card. Each post type fills a different subset:
   *
   *   civic.vote            → totalVotes
   *   civic.vote_results    → totalVotes (= participation_count) + commentsCount
   *   civic.announcement    → editCount + lastEditedAt (ISO)
   *   civic.meeting_summary → blockCount + maxStartSeconds (for duration)
   *
   * eventToPost reads from these and builds the engagement string.
   */
  totalVotes?: number;
  commentsCount?: number;
  editCount?: number;
  lastEditedAt?: string | null;
  blockCount?: number;
  maxStartSeconds?: number | null;
}

/**
 * Discriminate the underlying process type for an event from its data.
 *
 * - civic.process.started is only emitted by civic.vote today.
 * - civic.process.result_published is emitted by multiple process types;
 *   we use the event's data shape to tell them apart.
 *
 * Slice 8.5 changes:
 *   - Vote `result_published` events return `null` (not rendered in
 *     feed/digest — they duplicate the vote-results post). The event
 *     stays on the audit log but doesn't surface a feed item.
 *   - Vote-results `result_published` is discriminated by `data.results_id`
 *     (new) or the legacy `data.brief_id`. Both fields are accepted
 *     indefinitely so old events keep working without rewriting.
 */
function kindFromEvent(event: CivicEvent): ProcessKind | null {
  if (event.event_type === "civic.process.started") return "civic.vote";
  if (event.event_type === "civic.process.result_published") {
    const data = event.data as {
      brief_id?: unknown;
      results_id?: unknown;
      result?: unknown;
      announcement?: unknown;
      meeting_summary?: unknown;
      summary_id?: unknown;
    };
    if (data?.announcement !== undefined) return "civic.announcement";
    if (data?.meeting_summary !== undefined || typeof data?.summary_id === "string") {
      return "civic.meeting_summary";
    }
    if (typeof data?.results_id === "string" || typeof data?.brief_id === "string") {
      return "civic.vote_results";
    }
    // Vote `result_published` (data.result present, no results_id /
    // brief_id) — INTENTIONALLY EXCLUDED from the feed. See FeedPost
    // for the matching filter on the rendering side.
    if (data?.result !== undefined) return null;
  }
  return null;
}

export default function Feed({ filter, emptyFilteredAction }: Props) {
  const [events, setEvents] = useState<CivicEvent[]>([]);
  const [processMeta, setProcessMeta] = useState<Record<string, ProcessMeta>>({});
  // Slice 11 — process_ids whose underlying announcement has been
  // removed by a moderator. Posts pointing at these are excluded from
  // the feed entirely. Distinct from processMeta because we need a
  // negative signal that survives the meta cache filling in with {}.
  const [removedProcessIds, setRemovedProcessIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getEvents()
      .then((all) => {
        if (cancelled) return;
        setEvents(all);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Slice 13 fix — pre-filter to events that produce a feed post before
  // applying the user-facing type filter or paginating.
  //
  // Background: each rendered card maps to a single `civic.process.started`
  // (vote-open) or `civic.process.result_published` (everything else)
  // event. The events feed also contains `civic.process.created`,
  // `civic.process.aggregation_completed`, `civic.process.updated`, etc.
  // that don't render. Without this pre-filter, those non-renderable
  // events count against the PAGE_SIZE budget and can starve the visible
  // window — most acutely when synced events are backdated and the
  // most-recent N events become a cluster of `created` events from the
  // sync run.
  const renderableEvents = useMemo(
    () => {
      const base = events.filter((e) => kindFromEvent(e) !== null);
      return filter ? base.filter(filter) : base;
    },
    [events, filter],
  );

  const visibleEvents = useMemo(
    () => renderableEvents.slice(0, visibleCount),
    [renderableEvents, visibleCount],
  );

  // Fetch per-process metadata lazily for events visible in the feed. The
  // in-flight set is a ref so StrictMode's double-invoke doesn't double-fire
  // or cancel requests.
  const inFlight = useRef<Set<string>>(new Set());
  useEffect(() => {
    const needed: Array<{ id: string; kind: ProcessKind }> = [];
    for (const ev of visibleEvents) {
      const kind = kindFromEvent(ev);
      if (!kind) continue;
      if (!ev.process_id) continue;
      if (ev.process_id in processMeta) continue;
      if (inFlight.current.has(ev.process_id)) continue;
      needed.push({ id: ev.process_id, kind });
    }
    if (needed.length === 0) return;

    for (const { id } of needed) inFlight.current.add(id);

    for (const { id, kind } of needed) {
      let lookup: Promise<ProcessMeta | null>;
      if (kind === "civic.vote") {
        lookup = getProcessState(id).then((state) => {
          if (state.type !== "civic.vote") return null;
          const vote = state as VoteState;
          return {
            type: "civic.vote" as const,
            title: vote.title,
            description: vote.description,
            totalVotes: vote.total_votes ?? 0,
          };
        });
      } else if (kind === "civic.vote_results") {
        lookup = getPublicVoteResults(id).then((vr) => ({
          type: "civic.vote_results" as const,
          title: vr.title,
          description: vr.admin_notes ?? undefined,
          imageUrl: vr.image_url ?? null,
          imageAlt: vr.image_alt ?? null,
          totalVotes: vr.participation_count,
          commentsCount: vr.comments?.length ?? 0,
        }));
      } else if (kind === "civic.meeting_summary") {
        lookup = getMeetingSummary(id).then((s) => {
          // The longest start_time_seconds across all blocks gives a
          // reasonable lower bound for meeting duration; videos still
          // run past the last marked topic, so this is "at least this
          // long" rather than exact. Acceptable for the engagement line.
          const starts = (s.blocks ?? [])
            .map((b) => b.start_time_seconds)
            .filter((n): n is number => typeof n === "number");
          const maxStart = starts.length > 0 ? Math.max(...starts) : null;
          return {
            type: "civic.meeting_summary" as const,
            title: s.meeting_title,
            description: undefined,
            blockCount: s.blocks?.length ?? 0,
            maxStartSeconds: maxStart,
          };
        });
      } else {
        // civic.announcement — body serves as the feed summary.
        // Slice 11: when an admin has removed the announcement, push
        // its id into removedProcessIds so the post-builder filter
        // drops it. The presence of the removal still cooperates
        // with the meta cache (resolved to {}) so we don't refetch.
        lookup = getAnnouncement(id).then((a) => {
          if (a.moderation?.removed) {
            setRemovedProcessIds((prev) => {
              if (prev.has(id)) return prev;
              const next = new Set(prev);
              next.add(id);
              return next;
            });
            return null;
          }
          return {
            type: "civic.announcement" as const,
            title: a.title,
            description: a.body,
            imageUrl: a.image_url ?? null,
            imageAlt: a.image_alt ?? null,
            editCount: a.edit_count ?? 0,
            lastEditedAt: a.last_edited_at ?? null,
          };
        });
      }

      lookup
        .then((meta) => {
          if (meta) {
            setProcessMeta((prev) => ({ ...prev, [id]: meta }));
          } else {
            // Mark resolved-but-empty so we don't retry every re-render.
            setProcessMeta((prev) => ({ ...prev, [id]: {} }));
          }
        })
        .catch(() => {
          // Most commonly: vote-results not yet published (404). Cache as
          // empty so the post either skips rendering or shows a fallback.
          setProcessMeta((prev) => ({ ...prev, [id]: {} }));
        })
        .finally(() => {
          inFlight.current.delete(id);
        });
    }
  }, [visibleEvents, processMeta]);

  const posts: FeedPostView[] = useMemo(() => {
    const getTitle = (id: string) => processMeta[id]?.title;
    const getDescription = (id: string) => processMeta[id]?.description;
    const getType = (id: string) => processMeta[id]?.type;
    const out: FeedPostView[] = [];
    for (const ev of visibleEvents) {
      // Slice 11 — drop posts whose underlying announcement has been
      // removed by a moderator. The lookup loop above populates
      // removedProcessIds; this is the second half of the filter.
      if (ev.process_id && removedProcessIds.has(ev.process_id)) continue;
      const post = eventToPost(ev, getDescription, getTitle, getType);
      if (!post) continue;
      const meta = processMeta[ev.process_id];
      out.push({
        ...post,
        imageUrl: meta?.imageUrl ?? null,
        imageAlt: meta?.imageAlt ?? null,
        engagement: meta ? buildEngagement(post.pillKind, meta) : null,
      });
    }
    return out;
  }, [visibleEvents, processMeta, removedProcessIds]);

  const hasMore = renderableEvents.length > visibleCount;

  if (loading) {
    return (
      <section className="feed" aria-busy="true">
        <p className="feed-status">Loading feed…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="feed">
        <p className="feed-status feed-status-error">
          Could not load the feed: {error}
        </p>
      </section>
    );
  }

  if (posts.length === 0) {
    // Distinguish "feed is empty" from "filter matched nothing". The
    // first is the bootstrap state for a fresh hub; the second is a
    // resident's filter selection finding zero posts. The reset action
    // is provided by the parent (Home.tsx) when a filter is active.
    if (emptyFilteredAction && events.length > 0) {
      return (
        <section className="feed">
          <p className="feed-status">
            No posts match this filter yet.{" "}
          </p>
          <div className="feed-load-more-row">
            <button
              type="button"
              className="feed-load-more"
              onClick={emptyFilteredAction.onClick}
            >
              {emptyFilteredAction.label}
            </button>
          </div>
        </section>
      );
    }
    return (
      <section className="feed">
        <p className="feed-status">
          Floyd's civic feed is just getting started. Visit{" "}
          <Link to="/about">About</Link> to learn how this hub works.
        </p>
      </section>
    );
  }

  return (
    <section className="feed" aria-label="Civic activity feed">
      <ol className="feed-list">
        {posts.map((post) => (
          <li key={post.id} className="feed-list-item">
            <FeedPost post={post} />
          </li>
        ))}
      </ol>
      {hasMore && (
        <div className="feed-load-more-row">
          <button
            type="button"
            className="feed-load-more"
            onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
          >
            Load more
          </button>
        </div>
      )}
    </section>
  );
}

/**
 * Slice 10 — compose the per-card engagement / metadata line from the
 * fields the Feed container fetched lazily for this process. Returns
 * null whenever no real signal exists for the post type, so the line
 * is suppressed entirely (no "0 residents voted" cards).
 *
 * Plural/singular handling lives here to keep FeedPost rendering dumb.
 */
function buildEngagement(
  kind: FeedPillKind,
  meta: ProcessMeta,
): string | null {
  switch (kind) {
    case "vote-open": {
      const n = meta.totalVotes ?? 0;
      if (n === 0) return "Open for input — be the first to vote";
      const noun = n === 1 ? "resident has" : "residents have";
      return `${formatCount(n)} ${noun} voted so far`;
    }
    case "vote-results": {
      const n = meta.totalVotes ?? 0;
      const m = meta.commentsCount ?? 0;
      if (n === 0 && m === 0) return null;
      const parts: string[] = [];
      if (n > 0) {
        const noun = n === 1 ? "resident" : "residents";
        parts.push(`${formatCount(n)} ${noun} voted`);
      }
      if (m > 0) {
        const noun = m === 1 ? "comment" : "comments";
        parts.push(`${formatCount(m)} ${noun}`);
      }
      return parts.join(" · ");
    }
    case "announcement":
    case "announcement-author": {
      const c = meta.editCount ?? 0;
      if (c > 0 && meta.lastEditedAt) {
        return `Edited ${relativeTime(meta.lastEditedAt)}`;
      }
      return null;
    }
    case "meeting": {
      const b = meta.blockCount ?? 0;
      if (b === 0) return null;
      const noun = b === 1 ? "topic" : "topics";
      const parts = [`${formatCount(b)} ${noun} covered`];
      const dur = formatDuration(meta.maxStartSeconds ?? null);
      if (dur) parts.push(dur);
      return parts.join(" · ");
    }
  }
}

/** "1234" → "1.2k". Below 1000 returns the integer untouched. */
function formatCount(n: number): string {
  if (n < 1000) return String(n);
  const k = n / 1000;
  // 1.2k, 1.5k, 12k — one decimal under 10k, rounded otherwise.
  if (k < 10) return `${k.toFixed(1).replace(/\.0$/, "")}k`;
  return `${Math.round(k)}k`;
}

/**
 * Convert a max-block-start in seconds to a coarse duration label
 * ("12 min", "1h 5m"). Returns null when input is null / invalid.
 * "At least this long" — actual videos run past the last marked topic.
 */
function formatDuration(startSeconds: number | null): string | null {
  if (startSeconds == null || !Number.isFinite(startSeconds) || startSeconds <= 0) {
    return null;
  }
  const minutes = Math.max(1, Math.ceil(startSeconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes - h * 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}
