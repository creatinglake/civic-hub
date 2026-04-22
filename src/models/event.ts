// Civic Event model — aligned with Civic Event Spec v0.1
// Events are immutable records of actions taken within a civic hub.
//
// Events are the PRIMARY public interface of the hub.
// All external systems (feeds, dashboards, federation layers)
// should rely on events — not internal process APIs.

export interface EventSource {
  hub_id: string;
  hub_url: string;
}

export interface EventMeta {
  visibility: "public" | "restricted";
}

/**
 * Spec-compliant Civic Event.
 * All fields match Civic Event Spec v0.1 § 2–3.
 */
export interface CivicEvent {
  id: string;
  version: string;
  event_type: string;
  timestamp: string; // ISO 8601
  process_id: string;
  actor: string; // userId or DID
  jurisdiction: string;
  action_url: string;
  source: EventSource;
  dedupe_key?: string;
  data: Record<string, unknown>;
  meta: EventMeta;
}

/**
 * Input for emitEvent() — callers provide the minimum required fields.
 * The emitter fills in id, version, timestamp, source, action_url, and meta.
 *
 * Callers MAY override `action_url_path` when a process type's user-facing
 * URL differs from the default `/process/:id`. The path is prefixed with
 * the hub's UI base URL by the emitter. For example, civic.brief uses
 * `action_url_path: /brief/:id` so feed posts link to the public brief
 * page instead of the process detail view.
 */
export interface CreateEventInput {
  event_type: string;
  actor: string;
  process_id: string;
  hub_id: string;
  jurisdiction: string;
  data: Record<string, unknown>;
  dedupe_key?: string;
  visibility?: "public" | "restricted";
  action_url_path?: string; // e.g. "/brief/abc123"; defaults to "/process/:id"
}
