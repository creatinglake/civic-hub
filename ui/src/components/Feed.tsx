import { useEffect, useMemo, useRef, useState } from "react";
import {
  type CivicEvent,
  type VoteState,
  getEvents,
  getProcessState,
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

interface ProcessMeta {
  title?: string;
  description?: string;
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

  // Fetch process metadata lazily for events visible in the feed. Cached per
  // process id so a second scroll past the same post does not refetch. The
  // in-flight set uses a ref so StrictMode's effect double-invocation does
  // not double-fire requests or cancel the first run's fetches.
  const inFlight = useRef<Set<string>>(new Set());
  useEffect(() => {
    const needed: string[] = [];
    for (const ev of visibleEvents) {
      if (
        (ev.event_type === "civic.process.created" ||
          ev.event_type === "civic.process.result_published") &&
        ev.process_id &&
        !(ev.process_id in processMeta) &&
        !inFlight.current.has(ev.process_id)
      ) {
        needed.push(ev.process_id);
      }
    }
    if (needed.length === 0) return;

    for (const id of needed) inFlight.current.add(id);

    needed.forEach((id) => {
      getProcessState(id)
        .then((state) => {
          if (state.type !== "civic.vote") {
            setProcessMeta((prev) => ({ ...prev, [id]: {} }));
            return;
          }
          const vote = state as VoteState;
          setProcessMeta((prev) => ({
            ...prev,
            [id]: { title: vote.title, description: vote.description },
          }));
        })
        .catch(() => {
          // Best-effort enrichment — mark resolved so we don't retry on every
          // re-render, and render the post without a summary.
          setProcessMeta((prev) => ({ ...prev, [id]: {} }));
        })
        .finally(() => {
          inFlight.current.delete(id);
        });
    });
  }, [visibleEvents, processMeta]);

  const posts: FeedPostView[] = useMemo(() => {
    const getTitle = (id: string) => processMeta[id]?.title;
    const getDescription = (id: string) => processMeta[id]?.description;
    const out: FeedPostView[] = [];
    for (const ev of visibleEvents) {
      const post = eventToPost(ev, getDescription, getTitle);
      if (post) out.push(post);
    }
    return out;
  }, [visibleEvents, processMeta]);

  // Determine if more renderable (filtered) events exist beyond the current
  // page. We can't know which of the *unloaded* events will pass the post
  // filter without inspecting them — they're already loaded in `events`, so
  // we just compare counts of the filtered list.
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
