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
}

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
