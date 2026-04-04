// civic.vote process handler — thin wrapper around the civic.vote module.
//
// This handler delegates all vote-specific logic to the portable module
// at /modules/civic.vote/. It adapts the module's service interface
// to the hub's ProcessHandler contract.

import { Process, ProcessAction } from "../models/process.js";
import { emitEvent } from "../events/eventEmitter.js";
import { ProcessHandler } from "./types.js";
import {
  createVoteState,
  propose,
  addSupport,
  removeSupport,
  activate,
  submitVote,
  closeVote,
  finalizeVote,
  getReadModel,
  getSummary,
  type VoteProcessState,
} from "../modules/civic.vote/index.js";
import { recordVote } from "../modules/civic.receipts/index.js";

// --- Helpers ---

function getState(process: Process): VoteProcessState {
  return process.state as unknown as VoteProcessState;
}

function makeContext(process: Process) {
  return {
    process_id: process.id,
    hub_id: process.hubId,
    jurisdiction: process.jurisdiction,
    emit: emitEvent,
  };
}

function syncStatus(process: Process, state: VoteProcessState): void {
  process.status = state.status;
}

// --- Handler implementation ---

const voteProcess: ProcessHandler = {
  type: "civic.vote",

  initializeState(input: Record<string, unknown>): Record<string, unknown> {
    return createVoteState(input) as unknown as Record<string, unknown>;
  },

  handleAction(process: Process, action: ProcessAction): Record<string, unknown> {
    const state = getState(process);
    const ctx = makeContext(process);
    let result: Record<string, unknown>;

    switch (action.type) {
      case "process.propose": {
        const outcome = propose(state, action.actor, ctx);
        syncStatus(process, outcome.state);
        result = outcome.result;
        break;
      }
      case "process.support": {
        const outcome = addSupport(state, action.actor, ctx);
        syncStatus(process, outcome.state);
        result = outcome.result;
        break;
      }
      case "process.unsupport": {
        const outcome = removeSupport(state, action.actor, ctx);
        syncStatus(process, outcome.state);
        result = outcome.result;
        break;
      }
      case "process.activate": {
        const outcome = activate(state, action.actor, ctx);
        syncStatus(process, outcome.state);
        result = outcome.result;
        break;
      }
      case "process.vote": {
        const option = action.payload.option as string;
        const outcome = submitVote(state, action.actor, option, ctx);
        syncStatus(process, outcome.state);

        // Generate anonymous receipt — receipt_id is NOT stored with user_id
        const receipt = recordVote(process.id, action.actor, option);

        result = { ...outcome.result, receipt_id: receipt.receipt_id };
        break;
      }
      case "process.close": {
        const outcome = closeVote(state, action.actor, ctx);
        syncStatus(process, outcome.state);
        result = outcome.result;
        break;
      }
      case "process.finalize": {
        const outcome = finalizeVote(state, action.actor, ctx);
        syncStatus(process, outcome.state);
        result = outcome.result;
        break;
      }
      default:
        throw new Error(`Unknown action type for civic.vote: ${action.type}`);
    }

    return result;
  },

  getReadModel(process: Process, actor?: string): Record<string, unknown> {
    const state = getState(process);
    const model = getReadModel(state, {
      id: process.id,
      title: process.title,
      description: process.description,
      createdAt: process.createdAt,
      createdBy: process.createdBy,
    }, actor);

    // Include structured content and jurisdiction if present
    model.jurisdiction = process.jurisdiction;
    if (process.content) {
      model.content = process.content;
    }

    return model;
  },

  getSummary(process: Process): Record<string, unknown> {
    const state = getState(process);
    return getSummary(state, {
      id: process.id,
      title: process.title,
      createdAt: process.createdAt,
      createdBy: process.createdBy,
      status: process.status,
    });
  },
};

export default voteProcess;
