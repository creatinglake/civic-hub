/**
 * Event endpoint tests.
 *
 * Events are the PRIMARY public interface of the hub. These tests verify
 * the event feed returns spec-compliant Civic Events.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  apiJson,
  ensureSeedData,
  type EventsResponse,
  type CivicEventResponse,
} from "../fixtures/helpers.js";

describe("Event endpoints", () => {
  beforeAll(async () => {
    await ensureSeedData();
  });

  it("GET /events returns events in wrapped response", async () => {
    const { status, body } = await apiJson<EventsResponse>("/events");
    expect(status).toBe(200);
    expect(body.events).toBeDefined();
    expect(Array.isArray(body.events)).toBe(true);
    expect(body.events.length).toBeGreaterThan(0);
    expect(body.count).toBeGreaterThan(0);
  });

  it("events conform to Civic Event Spec v0.1 field structure", async () => {
    const { body } = await apiJson<EventsResponse>("/events");

    for (const event of body.events.slice(0, 5)) {
      // Required top-level fields
      expect(event.id).toBeDefined();
      expect(event.version).toBeDefined();
      expect(event.event_type).toBeDefined();
      expect(event.timestamp).toBeDefined();
      expect(event.process_id).toBeDefined();
      expect(event.actor).toBeDefined();
      expect(event.jurisdiction).toBeDefined();

      // Source block
      expect(event.source).toBeDefined();
      expect(event.source.hub_id).toBeDefined();
      expect(event.source.hub_url).toBeDefined();

      // Meta block
      expect(event.meta).toBeDefined();
      expect(event.meta.visibility).toBeDefined();

      // Data block
      expect(event.data).toBeDefined();
    }
  });

  it("event_type uses canonical civic.* prefix", async () => {
    const { body } = await apiJson<EventsResponse>("/events");
    for (const event of body.events) {
      expect(event.event_type).toMatch(/^civic\./);
    }
  });

  it("events are sorted descending by timestamp", async () => {
    const { body } = await apiJson<EventsResponse>("/events");
    const events = body.events;
    if (events.length < 2) return;

    for (let i = 1; i < events.length; i++) {
      const prev = new Date(events[i - 1].timestamp).getTime();
      const curr = new Date(events[i].timestamp).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it("GET /events?process_id=X filters by process", async () => {
    const { body: all } = await apiJson<EventsResponse>("/events");
    const processId = all.events[0].process_id;
    if (!processId) return;

    const { status, body } = await apiJson<EventsResponse>(
      `/events?process_id=${processId}`,
    );
    expect(status).toBe(200);
    for (const event of body.events) {
      expect(event.process_id).toBe(processId);
    }
  });

  it("GET /events?event_type=X filters by event type", async () => {
    const { status, body } = await apiJson<EventsResponse>(
      "/events?event_type=civic.process.created",
    );
    expect(status).toBe(200);
    expect(body.events.length).toBeGreaterThan(0);
    for (const event of body.events) {
      expect(event.event_type).toBe("civic.process.created");
    }
  });
});
