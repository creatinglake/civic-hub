// civic.digest module — type definitions
//
// A *service module*, not a process-type module. civic.digest isn't a
// civic process; it's a recurring hub-level capability that reads from
// the event store, formats a per-user summary, and delivers it by email.
// Same pluggability guardrail as the process-type modules: this file (and
// its siblings) MUST NOT import the hub's event store, DB client, or
// route layer. The host hub injects those via DigestAssemblyInput /
// the cron controller.
//
// GUARDRAIL: civic.digest MUST NOT import from civic.vote,
// civic.announcement, civic.brief, civic.auth, or any hub infrastructure
// module (events/, db/, services/, controllers/). Event filtering is
// performed on the generic CivicEvent shape only.

/** Minimal view of a CivicEvent the digest needs — mirrors models/event.ts. */
export interface DigestEvent {
  id: string;
  event_type: string;
  timestamp: string;
  process_id: string;
  action_url: string;
  data: Record<string, unknown>;
}

/** Minimal view of a User — mirrors civic.auth User fields the digest reads. */
export interface DigestUser {
  id: string;
  email: string;
  created_at: string;
  last_digest_sent_at: string | null;
}

/**
 * Hub-level context passed through to the module so the output can carry
 * the hub's name, UI origin, physical address, etc., without the module
 * reaching for env vars itself.
 */
export interface DigestHubContext {
  hub_name: string;
  ui_base_url: string;
  postal_address: string;
  /**
   * A pre-resolved per-user unsubscribe URL. The hub generates this via
   * `buildUnsubscribeUrl` so the module never touches the HMAC secret.
   */
  unsubscribe_url: string;
  /** URL to the settings page where users manage their subscription. */
  manage_subscriptions_url: string;
}

/** Grouping categories surfaced in the email body. Order matters for rendering. */
export type DigestItemKind =
  | "vote_opened"
  | "vote_result_published"
  | "brief_published"
  | "announcement";

/** A single row in the digest — one renderable civic event. */
export interface DigestItem {
  kind: DigestItemKind;
  title: string;
  /** 1–2 line plain-text summary shown under the title. May be empty. */
  summary: string;
  /** Absolute URL the "Read more" link points to (event.action_url). */
  action_url: string;
  /** ISO 8601 — used only for stable sort within a group. */
  timestamp: string;
}

/** Assembled digest payload for one user; null means "nothing to send." */
export interface DigestEmail {
  user_id: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  item_count: number;
}

/** Input to `assembleDigestForUser` — everything the module needs. */
export interface DigestAssemblyInput {
  user: DigestUser;
  events: DigestEvent[];
  hub: DigestHubContext;
  /**
   * ISO 8601 — the cut-off used to construct this digest. Purely
   * informational (printed in the footer); filtering happens before
   * assembly by the caller.
   */
  since: string;
  /**
   * Fallback lookup of process_id → human-readable title. Used when the
   * event's own `data` payload doesn't carry the title (true for most
   * civic.vote and civic.brief events — only civic.announcement events
   * include the title inline). The caller pre-fetches this once for the
   * whole batch to avoid per-user DB round-trips.
   */
  process_titles?: Record<string, string>;
}
