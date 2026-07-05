// Process service — manages process lifecycle via the process registry.
//
// Process endpoints (/process) are INTERNAL control surfaces.
// Events are the primary public interface of the hub.
// All external systems should rely on events, not internal process APIs.
//
// Storage: Postgres (processes table).
// This service delegates all process-specific logic to registered handlers
// and owns: storage, ID generation, lifecycle events, and the dispatch loop.
//
// Known limitation (accepted for the pilot): concurrent actions on the same
// process can race, because executeAction() does "read state → mutate →
// write state". Under low concurrency this is fine. Hardening path:
//   - optimistic locking via updated_at compare-and-swap, or
//   - SELECT ... FOR UPDATE inside a Postgres RPC.

import {
  Process,
  CreateProcessInput,
  ProcessAction,
  ProcessContent,
  ProcessDefinition,
  ProcessStatus,
} from "../models/process.js";
import { emitEvent } from "../events/eventEmitter.js";
import { generateId } from "../utils/id.js";
import {
  getProcessHandler,
  setProcessFactory,
  setActionDispatcher,
} from "../processes/registry.js";
import { getDb } from "../db/client.js";
import {
  resolveInitialStatus,
  isPubliclyFetchable,
  isActionable,
  shouldEmitStatusUpdate,
  nonPublicStatusFilter,
} from "./processLifecycle.js";
import {
  resolveCreators,
  resolveCreator,
  getCreator,
} from "./creatorDisplay.js";
import { HUB_ID, DEFAULT_JURISDICTION } from "../config/hub.js";


// --- Row <-> model mapping -------------------------------------------------

export interface ProcessRow {
  id: string;
  type: string;
  process_version: string;
  title: string;
  description: string | null;
  jurisdiction: string | null;
  status: ProcessStatus;
  content: ProcessContent | null;
  state: Record<string, unknown>;
  hub_id: string | null;
  created_by: string | null;
  source_proposal_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export function rowToProcess(row: ProcessRow): Process {
  const definition: ProcessDefinition = {
    type: row.type,
    version: row.process_version,
  };

  const proc: Process = {
    id: row.id,
    definition,
    title: row.title,
    description: row.description ?? "",
    status: row.status,
    hubId: row.hub_id ?? HUB_ID,
    jurisdiction: row.jurisdiction ?? DEFAULT_JURISDICTION,
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    state: row.state ?? {},
  };

  if (row.content) proc.content = row.content;
  return proc;
}

// --- Create ----------------------------------------------------------------

export async function createProcess(
  input: CreateProcessInput,
): Promise<Process> {
  const handler = getProcessHandler(input.definition.type);
  if (!handler) {
    throw new Error(`Unsupported process type: ${input.definition.type}`);
  }

  const id = input.id ?? generateId("proc");
  const initialState = handler.initializeState(input.state ?? {});

  // Use the state's status if the handler sets one (e.g. civic.vote → "draft").
  // Handlers that don't declare a resting status (announcements, vote-results,
  // deliberations) are created live, so default to "active".
  const stateStatus = (initialState as Record<string, unknown>).status as
    | ProcessStatus
    | undefined;
  const status: ProcessStatus = resolveInitialStatus(stateStatus);

  const hubId = input.hubId ?? HUB_ID;
  const jurisdiction = input.jurisdiction ?? DEFAULT_JURISDICTION;

  const row: Partial<ProcessRow> & { id: string } = {
    id,
    type: input.definition.type,
    process_version: input.definition.version,
    title: input.title,
    description: input.description,
    jurisdiction,
    status,
    content: input.content ?? null,
    state: initialState,
    hub_id: hubId,
    created_by: input.createdBy,
    source_proposal_id:
      ((input.state ?? {}) as Record<string, unknown>).source_proposal_id as
        | string
        | undefined ?? null,
  };

  const { data, error } = await getDb()
    .from("processes")
    .insert(row)
    .select()
    .single();

  if (error) {
    throw new Error(`ProcessService: failed to insert process: ${error.message}`);
  }

  const process = rowToProcess(data as ProcessRow);

  console.log(
    `[process] created ${process.definition.type} "${process.title}" (${id})`,
  );

  // Emit creation event. If this throws, the process row exists without a
  // creation event — acceptable edge case (caller sees an error; process can
  // be deleted or an event emitted manually during cleanup).
  await emitEvent({
    event_type: "civic.process.created",
    actor: input.createdBy,
    process_id: id,
    hub_id: process.hubId,
    jurisdiction: process.jurisdiction,
    data: {
      process: {
        type: input.definition.type,
        title: input.title,
      },
    },
    // Sync paths pass eventTimestamp = real-world publication time so the
    // feed orders synced items chronologically. Hand-authored callers omit
    // it and the emitter stamps `now`.
    timestamp: input.eventTimestamp,
  });

  return process;
}

// Inject createProcess into the registry so handlers (e.g. civic.vote spawning
// a civic.vote_results record on close) can create processes without circular
// imports.
setProcessFactory(createProcess);

// Inject the action dispatcher so handlers can run their own close action
// (lazy deadline-close) through the normal persisted-action path without a
// circular import back into this module.
setActionDispatcher(executeAction);

// --- Read ------------------------------------------------------------------

export async function getProcess(id: string): Promise<Process | undefined> {
  const { data, error } = await getDb()
    .from("processes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`ProcessService: ${error.message}`);
  if (!data) return undefined;
  return rowToProcess(data as ProcessRow);
}

export async function getAllProcesses(): Promise<Process[]> {
  const { data, error } = await getDb()
    .from("processes")
    .select("*")
    .not("status", "in", nonPublicStatusFilter())
    .order("created_at", { ascending: false });
  if (error) throw new Error(`ProcessService: ${error.message}`);
  return (data ?? []).map((r) => rowToProcess(r as ProcessRow));
}

// --- Action dispatch -------------------------------------------------------

export async function executeAction(
  processId: string,
  action: ProcessAction,
): Promise<{ process: Process; result: Record<string, unknown> }> {
  const process = await getProcess(processId);
  if (!process) {
    throw new Error(`Process not found: ${processId}`);
  }

  if (!isActionable(process.status)) {
    throw new Error(
      `Process ${processId} is finalized and cannot accept actions`,
    );
  }

  const handler = getProcessHandler(process.definition.type);
  if (!handler) {
    throw new Error(`Unsupported process type: ${process.definition.type}`);
  }

  const previousStatus = process.status;

  console.log(`[action] ${action.type} on ${processId} by ${action.actor}`);

  // Handler mutates process.state (and optionally process.status) in place,
  // then returns a result payload. It may also emit action-specific events.
  const result = await handler.handleAction(process, action);

  // Persist the mutated process back.
  const now = new Date().toISOString();
  const { error: updErr } = await getDb()
    .from("processes")
    .update({
      status: process.status,
      state: process.state,
      updated_at: now,
    })
    .eq("id", process.id);

  if (updErr) {
    throw new Error(
      `ProcessService: failed to persist action result: ${updErr.message}`,
    );
  }
  process.updatedAt = now;

  // Emit process.updated only when a meaningful state change occurred.
  if (shouldEmitStatusUpdate(previousStatus, process.status)) {
    await emitEvent({
      event_type: "civic.process.updated",
      actor: action.actor,
      process_id: process.id,
      hub_id: process.hubId,
      jurisdiction: process.jurisdiction,
      processType: process.definition.type,
      data: {
        process: {
          previous_status: previousStatus,
          status: process.status,
        },
      },
    });
  }

  return { process, result };
}

// --- Lazy deadline-close ---------------------------------------------------

/**
 * One type-agnostic lazy close. For ANY process whose deadline has elapsed and
 * is still open, the registered handler's `closeIfExpired` performs the terminal
 * transition (persist + emit) and returns the updated process. Handlers own
 * their own deadline source and close action (vote → voting_closes_at; polis
 * deliberation → deadline; proposal → proposals.closes_at); types without a
 * deadline (projects) omit the hook and are returned unchanged.
 *
 * Called from the read paths so the UI always sees the correct state without a
 * cron. Best-effort: a close failure (e.g. a race, or the Polis backend being
 * down) is logged and the original process is returned so the read still works.
 */
async function autoCloseIfExpired(process: Process): Promise<Process> {
  const handler = getProcessHandler(process.definition.type);
  if (!handler?.closeIfExpired) return process;

  try {
    return await handler.closeIfExpired(process);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.warn(
      `[auto-close] Failed to close ${process.definition.type} ${process.id}: ${msg}`,
    );
    return process;
  }
}

// --- UI read layer ---------------------------------------------------------

export async function listProcessSummaries(): Promise<Record<string, unknown>[]> {
  const all = await getAllProcesses();
  // Lazily close any process whose deadline has elapsed before summarizing.
  const resolved = await Promise.all(all.map(autoCloseIfExpired));
  const summaries = resolved.map((p) => {
    const handler = getProcessHandler(p.definition.type);
    if (handler) return handler.getSummary(p);
    return {
      id: p.id,
      type: p.definition.type,
      title: p.title,
      status: p.status,
      created_at: p.createdAt,
      created_by: p.createdBy,
    };
  });

  // Resolve every creator id in ONE query, then attach the human-facing
  // attribution (name + admin flag) and redact the raw id from this
  // public list. Summaries carry `created_by`; some types instead expose
  // an author id — those are enriched inside their own read models.
  const map = await resolveCreators(
    summaries.map((s) =>
      typeof (s as { created_by?: unknown }).created_by === "string"
        ? ((s as { created_by: string }).created_by)
        : "",
    ),
  );
  return summaries.map((s) => {
    const rawId =
      typeof (s as { created_by?: unknown }).created_by === "string"
        ? ((s as { created_by: string }).created_by)
        : "";
    const creator = getCreator(map, rawId);
    return {
      ...s,
      creator_name: creator.name,
      creator_is_admin: creator.is_admin,
      created_by: "",
    };
  });
}

export async function getProcessState(
  processId: string,
  actor?: string,
): Promise<Record<string, unknown> | undefined> {
  let process = await getProcess(processId);
  if (!process) return undefined;

  // Lifecycle gate: the canonical processes-row status is the single source of
  // truth for what's publicly fetchable. Processes still under review, or
  // soft-deleted/archived (declined, withdrawn, archived projects/proposals),
  // are not addressable by direct id — they're admin- or owner-facing only and
  // surface through their own queues. This also avoids leaking the
  // pending_review/internal-status mismatch via this read path.
  if (!isPubliclyFetchable(process.status)) {
    return undefined;
  }

  // Lazily close the process if its deadline has elapsed.
  process = await autoCloseIfExpired(process);

  const handler = getProcessHandler(process.definition.type);
  const model = handler
    ? await handler.getReadModel(process, actor)
    : {
        id: process.id,
        type: process.definition.type,
        title: process.title,
        status: process.status,
        created_at: process.createdAt,
        created_by: process.createdBy,
      };

  // Attach human-facing creator attribution and redact the raw id from this
  // public read model. Read models expose the creator id under `created_by`
  // (vote, project, proposal, generic) — types that use a different field
  // (announcement → author_id) enrich inside their own read model instead.
  return enrichProcessCreator(model);
}

/**
 * Attach `creator_name` + `creator_is_admin` to a process read model and
 * redact the raw `created_by` id. Shared by the single-process read path.
 * Idempotent-friendly: if the model has no `created_by`, resolves to the
 * "Resident" fallback and leaves the (already absent) id blank.
 */
async function enrichProcessCreator(
  model: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const rawId =
    typeof model.created_by === "string" ? (model.created_by as string) : "";
  const creator = await resolveCreator(rawId);
  return {
    ...model,
    creator_name: creator.name,
    creator_is_admin: creator.is_admin,
    created_by: "",
  };
}

// --- Dev/test utilities ----------------------------------------------------

/** Clear all processes — dev/seed only. */
/**
 * Persist the current in-memory Process back to storage. Used by flows
 * that mutate a process outside of the action dispatcher — for example,
 * the admin brief approval orchestration, which mutates the brief and
 * the linked vote directly via module functions (not HTTP actions).
 *
 * Updates status, state, and updated_at. Does NOT emit any events —
 * callers that cause status transitions are responsible for emitting
 * the corresponding lifecycle events themselves.
 */
export async function saveProcessState(process: Process): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await getDb()
    .from("processes")
    .update({
      status: process.status,
      state: process.state,
      updated_at: now,
    })
    .eq("id", process.id);
  if (error) {
    throw new Error(
      `ProcessService: failed to save process ${process.id}: ${error.message}`,
    );
  }
  process.updatedAt = now;
}

export async function deleteProcess(id: string): Promise<void> {
  // Delete associated events first to avoid orphaned feed entries.
  const { error: evError } = await getDb()
    .from("events")
    .delete()
    .eq("process_id", id);
  if (evError) {
    console.warn(
      `ProcessService: failed to delete events for process ${id}: ${evError.message}`,
    );
  }
  const { error } = await getDb().from("processes").delete().eq("id", id);
  if (error) {
    throw new Error(
      `ProcessService: failed to delete process ${id}: ${error.message}`,
    );
  }
}

/**
 * Delete events whose process_id doesn't match any existing process.
 * Returns the count of orphaned events removed.
 */
export async function cleanOrphanedEvents(): Promise<number> {
  const { data: processes } = await getDb()
    .from("processes")
    .select("id");
  const validIds = new Set((processes ?? []).map((p: { id: string }) => p.id));

  const { data: events } = await getDb()
    .from("events")
    .select("id, process_id");
  if (!events || events.length === 0) return 0;

  const orphanIds = (events as Array<{ id: string; process_id: string }>)
    .filter((e) => !validIds.has(e.process_id))
    .map((e) => e.id);
  if (orphanIds.length === 0) return 0;

  const { error } = await getDb()
    .from("events")
    .delete()
    .in("id", orphanIds);
  if (error) {
    throw new Error(`Failed to clean orphaned events: ${error.message}`);
  }
  return orphanIds.length;
}

export async function clearProcesses(): Promise<void> {
  const { error } = await getDb().from("processes").delete().neq("id", "");
  if (error) {
    throw new Error(`ProcessService: failed to clear processes: ${error.message}`);
  }
}
