import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import "./FeedFilter.css";

/**
 * Slice 10 — filter pills above the feed.
 *
 * Five pill choices: All / Votes / Announcements / Vote results / Meeting
 * summaries. The active pill matches the type discriminator that
 * Feed.tsx::kindFromEvent already uses, so the visible cards always
 * agree with the filter selection.
 *
 * State is mirrored in the URL as `?type=<key>` so a filter view is
 * bookmarkable and shareable. Missing param = "all". `useSearchParams`
 * preserves any other query params (the auth flow uses `?token=` etc.).
 */

export type FeedFilterKey =
  | "all"
  | "vote"
  | "announcement"
  | "vote_results"
  | "meeting_summary";

export interface FeedFilterChoice {
  key: FeedFilterKey;
  label: string;
  /** Pill modifier for color tokens — see Feed.css for the matching classes. */
  pillClass: string;
}

const CHOICES: FeedFilterChoice[] = [
  { key: "all", label: "All", pillClass: "feed-filter-pill--all" },
  { key: "vote", label: "Votes", pillClass: "feed-filter-pill--vote" },
  {
    key: "announcement",
    label: "Announcements",
    pillClass: "feed-filter-pill--announcement",
  },
  {
    key: "vote_results",
    label: "Vote results",
    pillClass: "feed-filter-pill--vote-results",
  },
  {
    key: "meeting_summary",
    label: "Meeting summaries",
    pillClass: "feed-filter-pill--meeting",
  },
];

const PARAM = "type";

function isFilterKey(v: string | null): v is FeedFilterKey {
  return (
    v === "vote" ||
    v === "announcement" ||
    v === "vote_results" ||
    v === "meeting_summary"
  );
}

/**
 * Public hook — read the current filter from the URL. Returns "all"
 * when the param is missing or unknown. Used by the parent (Home.tsx)
 * to compose the filter predicate it passes into <Feed>.
 */
export function useFeedFilter(): {
  active: FeedFilterKey;
  setActive: (next: FeedFilterKey) => void;
} {
  const [params, setParams] = useSearchParams();
  const raw = params.get(PARAM);
  const active: FeedFilterKey = isFilterKey(raw) ? raw : "all";

  function setActive(next: FeedFilterKey) {
    const updated = new URLSearchParams(params);
    if (next === "all") {
      updated.delete(PARAM);
    } else {
      updated.set(PARAM, next);
    }
    // `replace` keeps the back button focused on cross-page navigation,
    // not a stack of filter changes.
    setParams(updated, { replace: true });
  }

  return { active, setActive };
}

interface Props {
  active: FeedFilterKey;
  onChange: (next: FeedFilterKey) => void;
}

export default function FeedFilter({ active, onChange }: Props) {
  return (
    <nav className="feed-filter" aria-label="Filter feed by post type">
      <ul className="feed-filter-list">
        {CHOICES.map((choice) => {
          const isActive = choice.key === active;
          const cls = [
            "feed-filter-pill",
            choice.pillClass,
            isActive ? "is-active" : "",
          ]
            .filter(Boolean)
            .join(" ");
          return (
            <li key={choice.key}>
              <button
                type="button"
                className={cls}
                onClick={() => onChange(choice.key)}
                aria-pressed={isActive}
              >
                {choice.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Build the predicate Feed.tsx::Props.filter expects from the active
 * filter key. We re-implement the kind discrimination here (mirror of
 * Feed.tsx::kindFromEvent) rather than import it — keeps the filter
 * component decoupled, and the duplicated logic is small and stable.
 */
export function buildFilterPredicate(
  key: FeedFilterKey,
): ((event: { event_type: string; data: Record<string, unknown> }) => boolean) | undefined {
  if (key === "all") return undefined;
  return (event) => {
    if (event.event_type === "civic.process.started") {
      return key === "vote";
    }
    if (event.event_type === "civic.process.result_published") {
      const data = event.data as {
        announcement?: unknown;
        meeting_summary?: unknown;
        summary_id?: unknown;
        results_id?: unknown;
        brief_id?: unknown;
        result?: unknown;
      };
      if (data.announcement !== undefined) return key === "announcement";
      if (
        data.meeting_summary !== undefined ||
        typeof data.summary_id === "string"
      ) {
        return key === "meeting_summary";
      }
      if (
        typeof data.results_id === "string" ||
        typeof data.brief_id === "string"
      ) {
        return key === "vote_results";
      }
    }
    return false;
  };
}

/**
 * Convenience wrapper: returns a predicate-ready memoized value tied
 * to the active key. Caller passes the result straight to <Feed>.
 */
export function useFilterPredicate(active: FeedFilterKey) {
  return useMemo(() => buildFilterPredicate(active), [active]);
}

