// Civic Event model based on Civic Event Spec v0.1
// Events are immutable records of actions taken within a civic hub.
//
// Events are the PRIMARY public interface of the hub.
// All external systems (feeds, dashboards, federation layers)
// should rely on events — not internal process APIs.

export interface EventActor {
  id: string; // e.g., "user:alice" or a DID
}

export interface EventObject {
  type: string; // e.g., "vote", "civic.process"
  id?: string; // ID of the object acted upon
  [key: string]: unknown; // additional object-specific fields (e.g., option)
}

export interface EventContext {
  process_id: string;
  hub_id: string;
}

export interface EventMetadata {
  created_at: string; // ISO 8601
  source: string; // base URL of the hub
}

export interface CivicEvent {
  id: string;
  type: string; // e.g., "vote.created", "vote.submitted"
  actor: EventActor;
  object: EventObject;
  context: EventContext;
  metadata: EventMetadata;
}

export interface CreateEventInput {
  type: string;
  actor: string; // raw actor id — wrapped into { id } by the emitter
  object: EventObject;
  context: {
    process_id: string;
    hub_id: string;
  };
}
