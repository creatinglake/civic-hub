// civic.admin_digest — models for the admin-facing daily digest.
//
// Operator-side notification: counts of pending items in each
// admin-review queue (proposals, vote results, meeting summaries),
// sent once a day to every admin in CIVIC_ADMIN_EMAILS. NOT a civic
// event — does not flow through emitEvent() / /events.

export interface PendingItemSummary {
  /** Process or proposal id used to deep-link to the admin detail page. */
  id: string;
  /** Display title — truncated by the renderer if too long. */
  title: string;
  /** ISO timestamp when the item entered the queue (created_at usually). */
  created_at: string;
}

export interface QueueSnapshot {
  /** Total pending items in the queue (post-filter, pre-truncation). */
  count: number;
  /**
   * Up to N most-recent items for display in the email body. Empty when
   * count is zero. Capped to keep the email scannable; admins click
   * through to the panel for the full list.
   */
  items: PendingItemSummary[];
  /** Absolute URL to the admin index page for this queue. */
  panel_url: string;
}

export interface AdminDigestPayload {
  hub_name: string;
  generated_at: string;
  proposals: QueueSnapshot;
  vote_results: QueueSnapshot;
  meeting_summaries: QueueSnapshot;
  /** True when every queue is empty — caller should skip the send. */
  empty: boolean;
}
