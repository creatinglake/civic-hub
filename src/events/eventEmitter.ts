// Centralized event creation and emission
// All events flow through here to ensure consistency with the Civic Event Spec.
//
// Events are the PRIMARY public interface of the hub.
// All external systems should rely on events, not internal process APIs.

import { CivicEvent, CreateEventInput } from "../models/event.js";
import { appendEvent } from "./eventStore.js";
import { generateId } from "../utils/id.js";

const HUB_SOURCE = process.env.BASE_URL ?? "http://localhost:3000";

/**
 * Create and store a spec-compliant civic event.
 * This is the ONLY place events should be created.
 */
export function emitEvent(input: CreateEventInput): CivicEvent {
  const event: CivicEvent = {
    id: generateId("evt"),
    type: input.type,
    actor: { id: input.actor },
    object: input.object,
    context: input.context,
    metadata: {
      created_at: new Date().toISOString(),
      source: HUB_SOURCE,
    },
  };

  appendEvent(event);

  console.log(`[event] ${event.type} by ${event.actor.id} (${event.id})`);

  return event;
}
