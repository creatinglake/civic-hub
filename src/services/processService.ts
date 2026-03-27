// Process service — manages process lifecycle and delegates to process-type handlers.
//
// Process endpoints (/process) are INTERNAL control surfaces.
// Events are the primary public interface of the hub.
// All external systems should rely on events, not internal process APIs.

import {
  Process,
  CreateProcessInput,
  ProcessAction,
  ProcessStatus,
} from "../models/process.js";
import { emitEvent } from "../events/eventEmitter.js";
import { generateId } from "../utils/id.js";
import { handleVoteAction, initializeVoteState } from "./voteProcess.js";

// In-memory process store
const processes = new Map<string, Process>();

const HUB_ID = "civic-hub-local";

export function createProcess(input: CreateProcessInput): Process {
  const id = generateId("proc");
  const now = new Date().toISOString();

  let initialState = input.state ?? {};

  // Initialize process-specific state based on type
  if (input.definition.type === "civic.vote") {
    initialState = initializeVoteState(initialState);
  }

  const process: Process = {
    id,
    definition: input.definition,
    title: input.title,
    description: input.description,
    status: "active" as ProcessStatus,
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

  if (process.status === "closed" || process.status === "archived") {
    throw new Error(`Process ${processId} is ${process.status} and cannot accept actions`);
  }

  let result: Record<string, unknown> = {};
  const previousStatus = process.status;

  console.log(`[action] ${action.type} on ${processId} by ${action.actor}`);

  // Route to the correct process-type handler
  if (process.definition.type === "civic.vote") {
    result = handleVoteAction(process, action);
  } else {
    throw new Error(`Unsupported process type: ${process.definition.type}`);
  }

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
