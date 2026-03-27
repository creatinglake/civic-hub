// Process service — manages process lifecycle via the process registry.
//
// Process endpoints (/process) are INTERNAL control surfaces.
// Events are the primary public interface of the hub.
// All external systems should rely on events, not internal process APIs.
//
// This service delegates all process-specific logic to registered handlers.
// It owns: storage, ID generation, lifecycle events, and the dispatch loop.

import {
  Process,
  CreateProcessInput,
  ProcessAction,
  ProcessStatus,
} from "../models/process.js";
import { emitEvent } from "../events/eventEmitter.js";
import { generateId } from "../utils/id.js";
import { getProcessHandler } from "../processes/registry.js";

// In-memory process store
const processes = new Map<string, Process>();

const HUB_ID = "civic-hub-local";

export function createProcess(input: CreateProcessInput): Process {
  // Look up handler for this process type
  const handler = getProcessHandler(input.definition.type);
  if (!handler) {
    throw new Error(`Unsupported process type: ${input.definition.type}`);
  }

  const id = generateId("proc");
  const now = new Date().toISOString();

  // Delegate state initialization to the handler
  const initialState = handler.initializeState(input.state ?? {});

  const process: Process = {
    id,
    definition: input.definition,
    title: input.title,
    description: input.description,
    status: "open" as ProcessStatus,
    hubId: input.hubId ?? HUB_ID,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    state: initialState,
  };

  processes.set(id, process);

  console.log(`[process] created ${process.definition.type} "${process.title}" (${id})`);

  emitEvent({
    type: "vote.created",
    actor: input.createdBy,
    object: {
      type: "civic.process",
      id,
      process_type: input.definition.type,
      title: input.title,
    },
    context: { process_id: id, hub_id: process.hubId },
  });

  return process;
}

export function getProcess(id: string): Process | undefined {
  return processes.get(id);
}

export function executeAction(
  processId: string,
  action: ProcessAction
): { process: Process; result: Record<string, unknown> } {
  const process = processes.get(processId);
  if (!process) {
    throw new Error(`Process not found: ${processId}`);
  }

  if (process.status === "closed") {
    throw new Error(`Process ${processId} is closed and cannot accept actions`);
  }

  // Look up handler for this process type
  const handler = getProcessHandler(process.definition.type);
  if (!handler) {
    throw new Error(`Unsupported process type: ${process.definition.type}`);
  }

  const previousStatus = process.status;

  console.log(`[action] ${action.type} on ${processId} by ${action.actor}`);

  // Delegate to the registered handler
  const result = handler.handleAction(process, action);

  process.updatedAt = new Date().toISOString();

  // Emit process.updated only when a meaningful state change occurred
  if (process.status !== previousStatus) {
    emitEvent({
      type: "process.updated",
      actor: action.actor,
      object: {
        type: "civic.process",
        id: process.id,
        status: process.status,
      },
      context: { process_id: process.id, hub_id: process.hubId },
    });
  }

  return { process, result };
}

export function getAllProcesses(): Process[] {
  return Array.from(processes.values());
}

/** Clear all processes — used by debug/seed only */
export function clearProcesses(): void {
  processes.clear();
}

/**
 * Return a summary list of all processes, formatted for UI consumption.
 * Delegates to each handler's getSummary() method.
 */
export function listProcessSummaries(): Record<string, unknown>[] {
  return Array.from(processes.values()).map((p) => {
    const handler = getProcessHandler(p.definition.type);
    if (handler) {
      return handler.getSummary(p);
    }

    // Fallback for unknown types
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

/**
 * Return a UI-friendly state view for a process.
 * Delegates to the handler's getReadModel() method.
 * actor: optional — used to determine visibility rules.
 */
export function getProcessState(processId: string, actor?: string): Record<string, unknown> | undefined {
  const process = processes.get(processId);
  if (!process) return undefined;

  const handler = getProcessHandler(process.definition.type);
  if (handler) {
    return handler.getReadModel(process, actor);
  }

  // Fallback for unknown types
  return {
    id: process.id,
    type: process.definition.type,
    title: process.title,
    status: process.status,
    created_at: process.createdAt,
    created_by: process.createdBy,
  };
}
