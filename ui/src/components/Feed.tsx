import { useEffect, useMemo, useRef, useState } from "react";
import {
  type CivicEvent,
  type VoteState,
  getEvents,
  getProcessState,
  getPublicBrief,
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

type ProcessKind = "civic.vote" | "civic.brief";

interface ProcessMeta {
  type?: ProcessKind;
  title?: string;
  description?: string;
}

/**
 * Discriminate the underlying process type for an event from its data.
 * - civic.process.started is only emitted by civic.vote today.
 * - civic.process.result_published carries `brief_id` on brief emissions
 *   and `result` (with `tally`) on vote emissions.
 */
function kindFromEvent(event: CivicEvent): ProcessKind | null {
  if (event.event_type === "civic.process.started") return "civic.vote";
  if (event.event_type === "civic.process.result_published") {
    const data = event.data as { brief_id?: unknown; result?: unknown };
    if (typeof data?.brief_id === "string") return "civic.brief";
    if (data?.result !== undefined) return "civic.vote";
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
      const lookup =
        kind === "civic.vote"
          ? getProcessState(id).then((state) => {
              if (state.type !== "civic.vote") return null;
              const vote = state as VoteState;
              return { type: "civic.vote" as const, title: vote.title, description: vote.description };
            })
          : getPublicBrief(id).then((brief) => ({
              type: "civic.brief" as const,
              title: brief.title,
              description: undefined,
            }));

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
          // Most commonly: brief not yet published (404). Cache as empty so
          // the post either skips rendering or shows a fallback title.
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
      if (post) out.push(post);
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
        <p className="feed-status">No civic activity yet.</p>
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
