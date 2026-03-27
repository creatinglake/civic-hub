// Centralized event creation and emission
// All events flow through here to ensure consistency with the Civic Event Spec

import { CivicEvent, CreateEventInput } from "../models/event.js";
import { appendEvent } from "./eventStore.js";
import { generateId } from "../utils/id.js";

const HUB_SOURCE = "civic-hub-reference";

export function emitEvent(input: CreateEventInput): CivicEvent {
  const event: CivicEvent = {
    id: generateId("evt"),
    type: input.type,
    actor: input.actor,
    object: input.object,
    context: input.context,
    metadata: {
      timestamp: new Date().toISOString(),
      source: HUB_SOURCE,
    },
    data: input.data,
  };

  appendEvent(event);

  return event;
}
