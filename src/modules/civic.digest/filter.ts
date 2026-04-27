// civic.digest/filter.ts — canonical "digest-renderable" event predicate.
//
// MUST STAY IN SYNC with the Feed's filter rules in
// civic-hub/ui/src/components/Feed.tsx + ui/src/components/FeedPost.tsx.
// If the Feed grows a new post type, add it here too (and vice versa),
// or pull both sides into a shared module. The two should never diverge
// silently — a user's digest should not contain posts they'd never see
// on the feed, and vice versa.
//
// Rules (4 kinds as of Slice 8.5):
//   INCLUDE civic.process.started          from civic.vote
//     → the "new vote open for voting" signal.
//   INCLUDE civic.process.result_published from civic.vote_results
//     → admin-reviewed results delivered to the Board and published.
//       Discriminated by data.results_id (new) or the legacy
//       data.brief_id (events emitted before the Slice 8.5 rename).
//   INCLUDE civic.process.result_published from civic.announcement
//     → board / admin / authorized-author announcements.
//   INCLUDE civic.process.result_published from civic.meeting_summary
//     → AI-generated meeting summaries published after admin approval.
//
//   EXCLUDE civic.process.result_published from civic.vote
//     → vote `result_published` is preserved on the event log for
//       audit / federation, but excluded here because the vote-results
//       publication already covers it for resident-facing surfaces.
//       Slice 8.5 — collapses the previous duplicate-post-per-close.
//   EXCLUDE civic.process.created          (all process types)
//   EXCLUDE civic.process.updated          (all process types)
//   EXCLUDE civic.process.vote_submitted
//   EXCLUDE civic.process.comment_added
//   EXCLUDE civic.process.proposal_created
//   EXCLUDE civic.process.action_taken
//   EXCLUDE civic.process.ended
//   EXCLUDE civic.process.aggregation_completed
//   EXCLUDE civic.process.outcome_recorded

import type { DigestEvent, DigestItem, DigestItemKind } from "./models.js";

/**
 * Return true when an event should appear in a user's daily digest.
 * Same shape the Feed predicate should produce — keep in sync.
 */
export function isDigestRenderable(event: DigestEvent): boolean {
  if (event.event_type === "civic.process.started") {
    // Only civic.vote emits `started` today, so no secondary type check
    // is needed.
    return true;
  }
  if (event.event_type === "civic.process.result_published") {
    // Vote-process result_published is excluded — the vote-results
    // publication is the canonical user-facing signal. Discriminate
    // here on the same data shape used in classifyItemKind.
    const d = event.data as {
      results_id?: unknown;
      brief_id?: unknown;
      announcement?: unknown;
      meeting_summary?: unknown;
      summary_id?: unknown;
      result?: unknown;
    };
    if (d?.announcement !== undefined) return true;
    if (d?.meeting_summary !== undefined || typeof d?.summary_id === "string") {
      return true;
    }
    if (typeof d?.results_id === "string" || typeof d?.brief_id === "string") {
      return true;
    }
    // No discriminator matched → vote-process result_published or an
    // unknown new shape. Either way, exclude.
    if (d?.result !== undefined) return false;
    return false;
  }
  return false;
}

/**
 * Discriminate an event into one of the digest item kinds. Returns null
 * for events that aren't digest-renderable.
 *
 * Mirrors FeedPost.tsx::eventToPost but stays on the generic CivicEvent
 * shape so civic.digest doesn't import the UI rendering code.
 *
 * Backwards compat: vote-results events emitted before the Slice 8.5
 * rename carry data.brief_id; new ones carry data.results_id. Both
 * resolve to the same "vote_results_published" kind.
 */
export function classifyItemKind(event: DigestEvent): DigestItemKind | null {
  if (event.event_type === "civic.process.started") return "vote_opened";

  if (event.event_type === "civic.process.result_published") {
    const d = event.data as {
      brief_id?: unknown;
      results_id?: unknown;
      announcement?: unknown;
      meeting_summary?: unknown;
      summary_id?: unknown;
      result?: unknown;
    };
    if (d?.announcement !== undefined) return "announcement";
    if (d?.meeting_summary !== undefined || typeof d?.summary_id === "string") {
      return "meeting_summary_published";
    }
    if (typeof d?.results_id === "string" || typeof d?.brief_id === "string") {
      return "vote_results_published";
    }
    // Vote-process result_published — intentionally unclassified so the
    // assembler treats it as not-digest-renderable.
  }
  return null;
}

/**
 * Sort digest items for presentation: by kind (new votes → results →
 * meeting summaries → announcements), then by timestamp descending
 * inside each group. Caller is free to re-sort; this is the canonical
 * default.
 */
const KIND_ORDER: Record<DigestItemKind, number> = {
  vote_opened: 0,
  vote_results_published: 1,
  meeting_summary_published: 2,
  announcement: 3,
};

export function sortDigestItems(items: DigestItem[]): DigestItem[] {
  return [...items].sort((a, b) => {
    const ka = KIND_ORDER[a.kind];
    const kb = KIND_ORDER[b.kind];
    if (ka !== kb) return ka - kb;
    return b.timestamp.localeCompare(a.timestamp);
  });
}
