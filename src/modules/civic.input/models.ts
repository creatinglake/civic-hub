// civic.input module — type definitions
//
// Community input is stored independently from votes.
// It is not used in vote tallying or lifecycle transitions.

export interface CommunityInput {
  id: string;
  process_id: string;
  author_id: string;
  body: string;
  submitted_at: string; // ISO 8601
  /**
   * Slice 11 — moderation state. Null when the comment has never been
   * moderated. When `hidden` is true, public read-models redact `body`
   * to a tombstone string; admins still receive the original body and
   * the reason. A restore reverses the action — `hidden` flips back to
   * false and `restored_at` records when. The full audit trail lives
   * in the events table (civic.process.updated with restricted
   * visibility), not here — these columns reflect only the most recent
   * action.
   */
  moderation: CommentModeration | null;
}

/**
 * Reason chips offered in the admin "Hide a comment" modal. Mostly
 * informational — the chosen value is stored verbatim in the event's
 * data.moderation.reason and in community_inputs.hidden_reason. "Other"
 * lets an admin write a custom reason.
 */
export interface CommentModeration {
  hidden: boolean;
  hidden_at: string | null;
  hidden_by: string | null;
  reason: string | null;
  restored_at: string | null;
}

/** Max characters in an admin-supplied moderation reason. */
export const MODERATION_REASON_MAX = 500;

/**
 * Event emission callback — injected by the host hub. Mirrors the pattern
 * used by civic.vote: the module never imports the hub's event system
 * directly, keeping it portable across hubs.
 *
 * Returns a Promise so the host hub can durably store the event before
 * the caller proceeds. Callers should always `await` emissions.
 */
export interface EmitEventFn {
  (input: {
    event_type: string;
    actor: string;
    process_id: string;
    hub_id: string;
    jurisdiction: string;
    data: Record<string, unknown>;
    /**
     * Slice 11 — moderation events are emitted with restricted
     * visibility so they never leak to the public /events feed or the
     * resident-facing digest. Defaults to "public" when omitted.
     */
    visibility?: "public" | "restricted";
  }): Promise<unknown>;
}

/**
 * Context provided by the hub when submitting input, so the module can
 * emit a spec-compliant event without knowing the hub's identity.
 */
export interface InputContext {
  hub_id: string;
  jurisdiction: string;
  emit: EmitEventFn;
}

/** Max length of `body_preview` carried in comment_added event data. */
export const BODY_PREVIEW_LEN = 200;
