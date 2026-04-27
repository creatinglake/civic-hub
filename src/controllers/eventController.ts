// Event controller — handles HTTP request/response for event endpoints.
//
// Events are the PRIMARY public interface of the hub.
// All external systems should rely on events, not internal process APIs.

import { Request, Response } from "express";
import { getAllEvents, getEventsByProcessId } from "../events/eventStore.js";
import { getUserFromToken } from "../modules/civic.auth/index.js";
import { isAdminEmail } from "../middleware/auth.js";

/**
 * Slice 11 — events with `meta.visibility === "restricted"` are
 * moderation audit events. They MUST NOT appear on the public event
 * feed. Admins, however, do see them so they can audit moderation
 * actions externally if needed. We do a best-effort token check; any
 * failure short of an admin-positive identification falls back to the
 * public view.
 */
async function callerIsAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  if (!token) return false;
  try {
    const user = await getUserFromToken(token);
    if (!user) return false;
    return isAdminEmail(user.email);
  } catch {
    return false;
  }
}

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

    // Restricted events are admin-only. Default to public view; only
    // include restricted events when the caller authenticates as admin.
    const isAdmin = await callerIsAdmin(req);
    if (!isAdmin) {
      events = events.filter((e) => e.meta?.visibility !== "restricted");
    }

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
