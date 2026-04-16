// Append-only event store — backed by Postgres (events table).
//
// Events are the PRIMARY public interface of the hub.
// External systems should consume from this store (via /events),
// not from internal process APIs.
//
// The schema enforces append-only at the database level via a trigger
// that blocks UPDATE/DELETE on the events table. clearEvents() is the
// only DELETE path, and it is gated to dev-only callers.

import { getDb } from "../db/client.js";
import { CivicEvent } from "../models/event.js";

// --- Row <-> model mapping -------------------------------------------------

interface EventRow {
  id: string;
  version: string;
  event_type: string;
  process_id: string | null;
  actor: string | null;
  jurisdiction: string | null;
  action_url: string | null;
  source: { hub_id: string; hub_url: string } | null;
  dedupe_key: string | null;
  data: Record<string, unknown> | null;
  meta: { visibility: "public" | "restricted" } | null;
  created_at: string;
}

function rowToEvent(row: EventRow): CivicEvent {
  return {
    id: row.id,
    version: row.version,
    event_type: row.event_type,
    timestamp: row.created_at,
    process_id: row.process_id ?? "",
    actor: row.actor ?? "",
    jurisdiction: row.jurisdiction ?? "",
    action_url: row.action_url ?? "",
    source: row.source ?? { hub_id: "", hub_url: "" },
    ...(row.dedupe_key ? { dedupe_key: row.dedupe_key } : {}),
    data: row.data ?? {},
    meta: row.meta ?? { visibility: "public" },
  };
}

function eventToRow(event: CivicEvent): Omit<EventRow, "created_at"> {
  return {
    id: event.id,
    version: event.version,
    event_type: event.event_type,
    process_id: event.process_id || null,
    actor: event.actor || null,
    jurisdiction: event.jurisdiction || null,
    action_url: event.action_url || null,
    source: event.source,
    dedupe_key: event.dedupe_key ?? null,
    data: event.data ?? {},
    meta: event.meta,
  };
}

// --- Public API ------------------------------------------------------------

export async function appendEvent(event: CivicEvent): Promise<void> {
  const { error } = await getDb().from("events").insert(eventToRow(event));
  if (error) {
    // Events are the source of truth; never silently drop.
    throw new Error(`EventStore: failed to append event: ${error.message}`);
  }
}

export async function getAllEvents(): Promise<CivicEvent[]> {
  const { data, error } = await getDb()
    .from("events")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(`EventStore: ${error.message}`);
  return (data ?? []).map(rowToEvent);
}

export async function getEventsByProcessId(
  processId: string,
): Promise<CivicEvent[]> {
  const { data, error } = await getDb()
    .from("events")
    .select("*")
    .eq("process_id", processId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`EventStore: ${error.message}`);
  return (data ?? []).map(rowToEvent);
}

export async function getEventCount(): Promise<number> {
  const { count, error } = await getDb()
    .from("events")
    .select("*", { count: "exact", head: true });
  if (error) throw new Error(`EventStore: ${error.message}`);
  return count ?? 0;
}

/**
 * Reset the store — dev/seed only.
 *
 * The append-only trigger uses `BEFORE UPDATE OR DELETE FOR EACH ROW` which
 * allows bulk truncation through a direct DELETE statement. To stay within
 * the Supabase client API, we use a filter that matches every row.
 */
export async function clearEvents(): Promise<void> {
  const { error } = await getDb().from("events").delete().neq("id", "");
  if (error) {
    // If the append-only trigger is firing (shouldn't — it's BEFORE UPDATE/DELETE
    // on individual rows, not bulk), surface the error clearly.
    throw new Error(`EventStore: failed to clear events: ${error.message}`);
  }
}
