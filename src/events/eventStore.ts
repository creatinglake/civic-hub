// Append-only in-memory event store
// All civic events are stored here for retrieval and future federation

import { CivicEvent } from "../models/event.js";

const events: CivicEvent[] = [];

export function appendEvent(event: CivicEvent): void {
  events.push(event);
}

export function getAllEvents(): CivicEvent[] {
  return [...events];
}

export function getEventsByProcessId(processId: string): CivicEvent[] {
  return events.filter((e) => e.context.processId === processId);
}

export function getEventCount(): number {
  return events.length;
}
