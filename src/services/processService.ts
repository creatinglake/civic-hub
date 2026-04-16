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
import { getProcessHandler, setProcessFactory } from "../processes/registry.js";
import { getDb } from "../db/client.js";

const HUB_ID = "civic-hub-local";
const DEFAULT_JURISDICTION = "local";

// --- Row <-> model mapping -------------------------------------------------

interface ProcessRow {
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

function rowToProcess(row: ProcessRow): Process {
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

  // Use the state's status if the handler sets one (e.g. civic.vote → "draft"),
  // otherwise default to "open" (legacy civic.proposal).
  const stateStatus = (initialState as Record<string, unknown>).status as
    | ProcessStatus
    | undefined;
  const status: ProcessStatus = stateStatus ?? ("open" as ProcessStatus);

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
  });

  return process;
}

// Inject createProcess into the registry so handlers (e.g. civic.proposal
// → civic.vote promotion) can spawn new processes without circular imports.
setProcessFactory(createProcess);

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

  if (process.status === "finalized") {
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
  if (process.status !== previousStatus) {
    await emitEvent({
      event_type: "civic.process.updated",
      actor: action.actor,
      process_id: process.id,
      hub_id: process.hubId,
      jurisdiction: process.jurisdiction,
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

// --- UI read layer ---------------------------------------------------------

export async function listProcessSummaries(): Promise<Record<string, unknown>[]> {
  const all = await getAllProcesses();
  return all.map((p) => {
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
}

export async function getProcessState(
  processId: string,
  actor?: string,
): Promise<Record<string, unknown> | undefined> {
  const process = await getProcess(processId);
  if (!process) return undefined;

  const handler = getProcessHandler(process.definition.type);
  if (handler) return handler.getReadModel(process, actor);

  return {
    id: process.id,
    type: process.definition.type,
    title: process.title,
    status: process.status,
    created_at: process.createdAt,
    created_by: process.createdBy,
  };
}

// --- Dev/test utilities ----------------------------------------------------

/** Clear all processes — dev/seed only. */
export async function clearProcesses(): Promise<void> {
  const { error } = await getDb().from("processes").delete().neq("id", "");
  if (error) {
    throw new Error(`ProcessService: failed to clear processes: ${error.message}`);
  }
}
