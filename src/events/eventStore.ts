// Append-only in-memory event store
// All civic events are stored here for retrieval and future federation.
//
// Events are the PRIMARY public interface of the hub.
// External systems should consume from this store (via /events),
// not from internal process APIs.
//
// DEV-ONLY: In-memory storage. All data is lost on restart.
// Replace with a persistent store (e.g., SQLite, Postgres) before production.

import { CivicEvent } from "../models/event.js";

// DEV-ONLY: In-memory array — replace with persistent storage for production.
const events: CivicEvent[] = [];

export function appendEvent(event: CivicEvent): void {
  events.push(event);
}

export function getAllEvents(): CivicEvent[] {
  return [...events];
}

export function getEventsByProcessId(processId: string): CivicEvent[] {
  return events.filter((e) => e.process_id === processId);
}

export function getEventCount(): number {
  return events.length;
}

/** Reset the store — used by debug/test endpoints only */
export function clearEvents(): void {
  events.length = 0;
}
