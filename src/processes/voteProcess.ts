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
  getReadModel,
  getSummary,
  type VoteProcessState,
} from "../modules/civic.vote/index.js";
import { recordVote } from "../modules/civic.receipts/index.js";
import type { BriefProcessState } from "../modules/civic.brief/index.js";
import { emitBriefAggregationCompleted } from "../modules/civic.brief/events.js";
import { getProcessFactory, getProcessHandler } from "./registry.js";

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

/**
 * Spawn a civic.brief process from a just-closed vote and link the two
 * via the parent's follow_up_process_ids array (Civic Process Spec §11.3).
 *
 * The generic process factory emits civic.process.created for the brief;
 * we additionally fire the brief's aggregation_completed here so the
 * spec's Phase 4 boundary is observable on the event feed.
 */
async function spawnBriefFromClosedVote(
  voteProcess: Process,
  closeResult: Record<string, unknown>,
): Promise<Process> {
  const factory = getProcessFactory();
  const brief = await factory({
    definition: { type: "civic.brief", version: "0.1" },
    // Title mirrors the vote's title. Contextual labels ("Civic Brief
    // delivered: …" in the feed, "Civic Brief" eyebrow on the public page,
    // "Civic Briefs" in the admin tab, etc.) handle disambiguation so the
    // bare title doesn't need to repeat itself.
    title: voteProcess.title,
    description: voteProcess.description,
    hubId: voteProcess.hubId,
    jurisdiction: voteProcess.jurisdiction,
    createdBy: "system",
    state: {
      source_process_id: voteProcess.id,
      vote_title: voteProcess.title,
      tally: closeResult.tally,
      total_votes: closeResult.total_votes,
    },
  });

  // Emit aggregation_completed for the brief. (civic.process.created is
  // already emitted by the generic factory in processService.)
  const briefState = brief.state as unknown as BriefProcessState;
  await emitBriefAggregationCompleted(
    {
      process_id: brief.id,
      hub_id: brief.hubId,
      jurisdiction: brief.jurisdiction,
      emit: emitEvent,
    },
    "system",
    briefState,
  );

  // Link the parent vote to the new brief. This mutation of
  // voteProcess.state is persisted by processService after handleAction
  // returns. Per Civic Process Spec §11.3, follow_up_process_ids is the
  // canonical parent→child linkage.
  const voteState = voteProcess.state as unknown as VoteProcessState & {
    follow_up_process_ids?: string[];
  };
  voteState.follow_up_process_ids = [
    ...(voteState.follow_up_process_ids ?? []),
    brief.id,
  ];

  return brief;
}

// --- Handler implementation ---

const voteProcess: ProcessHandler = {
  type: "civic.vote",

  initializeState(input: Record<string, unknown>): Record<string, unknown> {
    return createVoteState(input) as unknown as Record<string, unknown>;
  },

  async handleAction(
    process: Process,
    action: ProcessAction,
  ): Promise<Record<string, unknown>> {
    const state = getState(process);
    const ctx = makeContext(process);
    let result: Record<string, unknown>;

    switch (action.type) {
      case "process.propose": {
        const outcome = await propose(state, action.actor, ctx);
        syncStatus(process, outcome.state);
        result = outcome.result;
        break;
      }
      case "process.support": {
        const outcome = await addSupport(state, action.actor, ctx);
        syncStatus(process, outcome.state);
        result = outcome.result;
        break;
      }
      case "process.unsupport": {
        const outcome = await removeSupport(state, action.actor, ctx);
        syncStatus(process, outcome.state);
        result = outcome.result;
        break;
      }
      case "process.activate": {
        const outcome = await activate(state, action.actor, ctx);
        syncStatus(process, outcome.state);
        result = outcome.result;
        break;
      }
      case "process.vote": {
        const option = action.payload.option as string;
        const outcome = await submitVote(state, action.actor, option, ctx);
        syncStatus(process, outcome.state);

        // Generate anonymous receipt — receipt_id is NOT stored with user_id
        const receipt = await recordVote(process.id, action.actor, option);

        result = { ...outcome.result, receipt_id: receipt.receipt_id };
        break;
      }
      case "process.close": {
        const outcome = await closeVote(state, action.actor, ctx);
        syncStatus(process, outcome.state);
        result = outcome.result;

        // If civic.brief is registered, spawn a brief from the now-closed
        // vote. Hubs that don't register civic.brief simply skip this step.
        const briefHandler = getProcessHandler("civic.brief");
        if (briefHandler) {
          const brief = await spawnBriefFromClosedVote(process, outcome.result);
          result = { ...result, brief_process_id: brief.id };
        }
        break;
      }
      // Note: there is intentionally no `process.finalize` action here.
      // Finalization publishes the vote result, which must be gated on
      // admin approval of the accompanying civic.brief. The brief module's
      // approval flow calls `finalizeVote` directly as a library import;
      // there is no HTTP path that publishes a vote result without
      // approved-brief orchestration.
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
