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
import FeedPost, { eventToPost, type FeedPostView } from "./FeedPost";
import "./Feed.css";

const PAGE_SIZE = 50;

interface Props {
  /**
   * Optional filter predicate applied before pagination. Reserved for future
   * filter/search UI — kept as a prop now so that adding it later is a
   * parent-level concern, not a Feed rewrite.
   */
  filter?: (event: CivicEvent) => boolean;
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

export default function Feed({ filter }: Props) {
  const [events, setEvents] = useState<CivicEvent[]>([]);
  const [processMeta, setProcessMeta] = useState<Record<string, ProcessMeta>>({});
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

  const renderableEvents = useMemo(
    () => (filter ? events.filter(filter) : events),
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
          };
        });
      } else if (kind === "civic.vote_results") {
        lookup = getPublicVoteResults(id).then((vr) => ({
          type: "civic.vote_results" as const,
          title: vr.title,
          description: vr.admin_notes ?? undefined,
          imageUrl: vr.image_url ?? null,
          imageAlt: vr.image_alt ?? null,
        }));
      } else if (kind === "civic.meeting_summary") {
        lookup = getMeetingSummary(id).then((s) => ({
          type: "civic.meeting_summary" as const,
          title: s.meeting_title,
          description: undefined,
        }));
      } else {
        // civic.announcement — body serves as the feed summary.
        lookup = getAnnouncement(id).then((a) => ({
          type: "civic.announcement" as const,
          title: a.title,
          description: a.body,
          imageUrl: a.image_url ?? null,
          imageAlt: a.image_alt ?? null,
        }));
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
      const post = eventToPost(ev, getDescription, getTitle, getType);
      if (!post) continue;
      const meta = processMeta[ev.process_id];
      out.push({
        ...post,
        imageUrl: meta?.imageUrl ?? null,
        imageAlt: meta?.imageAlt ?? null,
      });
    }
    return out;
  }, [visibleEvents, processMeta]);

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
