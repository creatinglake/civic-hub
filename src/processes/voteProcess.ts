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
import type { VoteResultsProcessState } from "../modules/civic.vote_results/index.js";
import { emitVoteResultsAggregationCompleted } from "../modules/civic.vote_results/events.js";
import { getInputsByProcess } from "../modules/civic.input/index.js";
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
 * Spawn a civic.vote_results process from a just-closed vote and link
 * the two via the parent's follow_up_process_ids array (Civic Process
 * Spec §11.3).
 *
 * The generic process factory emits civic.process.created for the
 * vote-results record; we additionally fire its aggregation_completed
 * here so the spec's Phase 4 boundary is observable on the event feed.
 *
 * The vote's description, options, and voting window are snapshotted
 * onto the vote-results state so the published page can show residents
 * the original question and options without having to read back to the
 * vote process.
 */
async function spawnVoteResultsFromClosedVote(
  voteProcess: Process,
  closeResult: Record<string, unknown>,
): Promise<Process> {
  // Seed with community comments collected during the vote. Best-effort:
  // if the read fails we proceed with an empty list rather than block
  // the vote-close flow — admin can still add comments manually.
  let comments: string[] = [];
  try {
    const inputs = await getInputsByProcess(voteProcess.id);
    comments = inputs
      .map((i) => i.body.trim())
      .filter((body) => body.length > 0);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.warn(
      `[voteProcess] Could not read civic.input for vote-results seeding on ${voteProcess.id}: ${message}`,
    );
  }

  // Snapshot the vote context. options on civic.vote are bare strings
  // for MVP, so {id, label} both equal the option string — same
  // convention as VoteResultsPositionBreakdown.
  const voteState = voteProcess.state as unknown as VoteProcessState;
  const voteOptions = voteState.options.map((o) => ({
    option_id: o,
    option_label: o,
  }));

  const factory = getProcessFactory();
  const voteResults = await factory({
    definition: { type: "civic.vote_results", version: "0.1" },
    // Title mirrors the vote's title. Contextual labels ("Vote results"
    // pill in the feed, "Vote results: …" page heading, "Vote results"
    // admin tab, etc.) handle disambiguation so the bare title doesn't
    // need to repeat itself.
    title: voteProcess.title,
    description: voteProcess.description,
    hubId: voteProcess.hubId,
    jurisdiction: voteProcess.jurisdiction,
    createdBy: "system",
    state: {
      source_process_id: voteProcess.id,
      vote_title: voteProcess.title,
      vote_description: voteProcess.description,
      vote_options: voteOptions,
      vote_starts_at: voteState.voting_opens_at,
      vote_ends_at: voteState.voting_closes_at,
      tally: closeResult.tally,
      total_votes: closeResult.total_votes,
      comments,
    },
  });

  // Emit aggregation_completed for the vote-results record.
  // (civic.process.created is already emitted by the generic factory.)
  const voteResultsState = voteResults.state as unknown as VoteResultsProcessState;
  await emitVoteResultsAggregationCompleted(
    {
      process_id: voteResults.id,
      hub_id: voteResults.hubId,
      jurisdiction: voteResults.jurisdiction,
      emit: emitEvent,
    },
    "system",
    voteResultsState,
  );

  // Link the parent vote to the new vote-results record. Per Civic
  // Process Spec §11.3, follow_up_process_ids is the canonical parent
  // → child linkage. This mutation of voteProcess.state is persisted by
  // processService after handleAction returns.
  const linkedVoteState = voteProcess.state as unknown as VoteProcessState & {
    follow_up_process_ids?: string[];
  };
  linkedVoteState.follow_up_process_ids = [
    ...(linkedVoteState.follow_up_process_ids ?? []),
    voteResults.id,
  ];

  return voteResults;
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

        // If civic.vote_results is registered, spawn a vote-results
        // record from the now-closed vote. Hubs that don't register
        // civic.vote_results simply skip this step. The result key
        // remains `brief_process_id` for backwards compatibility with
        // any caller that reads it (the public name changed in
        // Slice 8.5; the close-flow result shape did not).
        const voteResultsHandler = getProcessHandler("civic.vote_results");
        if (voteResultsHandler) {
          const voteResults = await spawnVoteResultsFromClosedVote(
            process,
            outcome.result,
          );
          result = { ...result, brief_process_id: voteResults.id };
        }
        break;
      }
      // Note: there is intentionally no `process.finalize` action here.
      // Finalization publishes the vote result, which must be gated on
      // admin approval of the accompanying civic.vote_results record.
      // The vote-results module's approval flow calls `finalizeVote`
      // directly as a library import; there is no HTTP path that
      // publishes a vote result without approved-results orchestration.
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
