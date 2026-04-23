// civic.digest/filter.ts — canonical "digest-renderable" event predicate.
//
// MUST STAY IN SYNC with the Feed's filter rules in
// civic-hub/ui/src/components/Feed.tsx + ui/src/components/FeedPost.tsx.
// If the Feed grows a new post type, add it here too (and vice versa),
// or pull both sides into a shared module. The two should never diverge
// silently — a user's digest should not contain posts they'd never see
// on the feed, and vice versa.
//
// Rules:
//   INCLUDE civic.process.started          from civic.vote
//     → the "new vote open for voting" signal. The Feed uses `started`
//       (not `created`) as the new-vote-open event; we match it so the
//       two filters stay aligned.
//   INCLUDE civic.process.result_published from civic.vote
//     → vote results published.
//   INCLUDE civic.process.result_published from civic.brief
//     → civic brief published after admin approval.
//   INCLUDE civic.process.result_published from civic.announcement
//     → board / admin / authorized-author announcements.
//
//   EXCLUDE civic.process.created          (all process types)
//     → factory-generated, silent to the Feed.
//   EXCLUDE civic.process.updated          (all process types)
//     → too noisy for a daily digest; the current content is in
//       result_published or is read from the detail page.
//   EXCLUDE civic.process.vote_submitted
//   EXCLUDE civic.process.comment_added
//   EXCLUDE civic.process.proposal_created
//   EXCLUDE civic.process.action_taken
//   EXCLUDE civic.process.ended
//   EXCLUDE civic.process.aggregation_completed
//   EXCLUDE civic.process.outcome_recorded
//     → participation and intermediate lifecycle events; not meaningful
//       to surface in a resident-facing daily digest.

import type { DigestEvent, DigestItem, DigestItemKind } from "./models.js";

/**
 * Return true when an event should appear in a user's daily digest.
 * Same shape the Feed predicate should produce — keep in sync.
 */
export function isDigestRenderable(event: DigestEvent): boolean {
  if (event.event_type === "civic.process.started") {
    // Only civic.vote emits `started` today, so no secondary type check
    // is needed. If a future process type starts emitting `started`,
    // branch on event.data here.
    return true;
  }
  if (event.event_type === "civic.process.result_published") {
    // result_published is emitted by civic.vote, civic.brief, and
    // civic.announcement. We include all three — they're the three
    // canonical "new thing published" signals on the Feed.
    return true;
  }
  return false;
}

/**
 * Discriminate an event into one of the four digest item kinds.
 * Returns null for events that aren't digest-renderable (or are but
 * don't match a known kind — a defensive fallback).
 *
 * Mirrors the logic in FeedPost.tsx::eventToPost but stays on the
 * generic CivicEvent shape so civic.digest doesn't import the UI
 * rendering code.
 */
export function classifyItemKind(event: DigestEvent): DigestItemKind | null {
  if (event.event_type === "civic.process.started") return "vote_opened";

  if (event.event_type === "civic.process.result_published") {
    const d = event.data as {
      brief_id?: unknown;
      announcement?: unknown;
      result?: unknown;
    };
    if (d?.announcement !== undefined) return "announcement";
    if (typeof d?.brief_id === "string") return "brief_published";
    if (d?.result !== undefined) return "vote_result_published";
  }
  return null;
}

/**
 * Sort digest items for presentation: by kind (new votes → results →
 * briefs → announcements), then by timestamp descending inside each
 * group. Caller is free to re-sort; this is the canonical default.
 */
const KIND_ORDER: Record<DigestItemKind, number> = {
  vote_opened: 0,
  vote_result_published: 1,
  brief_published: 2,
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
