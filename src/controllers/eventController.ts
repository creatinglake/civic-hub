// Event controller — handles HTTP request/response for event endpoints.
//
// Events are the PRIMARY public interface of the hub.
// All external systems should rely on events, not internal process APIs.

import { Request, Response } from "express";
import { getAllEvents, getEventsByProcessId } from "../events/eventStore.js";

export async function handleGetEvents(
  req: Request,
  res: Response,
): Promise<void> {
  const processId = req.query.process_id as string | undefined;
  const eventType = req.query.event_type as string | undefined;
  const pretty = req.query.pretty === "true";

  try {
    let events = processId
      ? await getEventsByProcessId(processId)
      : await getAllEvents();

    // Optional: further filter by event type (combinable with process_id)
    if (eventType) {
      events = events.filter((e) => e.event_type === eventType);
    }

    const body = { events, count: events.length };

    if (pretty) {
      res.setHeader("Content-Type", "application/json");
      res.send(JSON.stringify(body, null, 2));
    } else {
      res.json(body);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
