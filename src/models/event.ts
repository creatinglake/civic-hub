// Civic Event model based on Civic Event Spec v0.1
// Events are immutable records of actions taken within a civic hub

export interface CivicEvent {
  id: string;
  type: string; // e.g., "vote.created", "vote.submitted"
  actor: string; // userId or DID of who performed the action
  object: {
    type: string; // e.g., "civic.process"
    id: string; // ID of the object acted upon
  };
  context: {
    hubId: string;
    processId?: string;
  };
  metadata: {
    timestamp: string; // ISO 8601
    source: string; // origin hub identifier
  };
  data?: Record<string, unknown>; // additional event-specific data
}

export interface CreateEventInput {
  type: string;
  actor: string;
  object: {
    type: string;
    id: string;
  };
  context: {
    hubId: string;
    processId?: string;
  };
  data?: Record<string, unknown>;
}
