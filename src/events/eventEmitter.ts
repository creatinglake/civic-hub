// Centralized event creation and emission.
//
// All events flow through here to ensure consistency with the Civic Event
// Spec v0.1 (with known divergences documented in HANDOFF.md).
//
// Events are the PRIMARY public interface of the hub. All external systems
// should rely on events, not internal process APIs.

import { CivicEvent, CreateEventInput } from "../models/event.js";
import { appendEvent } from "./eventStore.js";
import { generateId } from "../utils/id.js";
import { baseUrl, uiBaseUrl } from "../utils/baseUrl.js";

/**
 * Create and durably store a spec-compliant civic event.
 * This is the ONLY place events should be created.
 *
 * Returns the stored event. Throws if the DB write fails — callers should
 * surface the error (events are the source of truth; never silently drop).
 */
export async function emitEvent(input: CreateEventInput): Promise<CivicEvent> {
  const hub = baseUrl();
  const ui = uiBaseUrl();
  // action_url is the user-facing UI URL (per Civic Event Spec §3 — "link to
  // take action"). Defaults to /process/:id; callers can override via
  // action_url_path when a process type has a distinct public page.
  const path = input.action_url_path ?? `/process/${input.process_id}`;
  const event: CivicEvent = {
    id: generateId("evt"),
    version: "1.0",
    event_type: input.event_type,
    timestamp: new Date().toISOString(),
    process_id: input.process_id,
    actor: input.actor,
    jurisdiction: input.jurisdiction,
    action_url: `${ui}${path}`,
    source: {
      hub_id: input.hub_id,
      hub_url: hub,
    },
    data: input.data,
    meta: {
      visibility: input.visibility ?? "public",
    },
  };

  if (input.dedupe_key) {
    event.dedupe_key = input.dedupe_key;
  }

  await appendEvent(event);

  console.log(`[event] ${event.event_type} by ${event.actor} (${event.id})`);

  return event;
}
