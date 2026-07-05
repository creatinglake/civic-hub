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
  getVotingMethod,
  DEFAULT_METHOD,
  type VoteProcessState,
  type Ballot,
} from "../modules/civic.vote/index.js";
import {
  recordOrUpdateVote,
  clearActiveVoteKeysForProcess,
  getActiveChoice,
  getBallotChoicesForProcess,
  hasUserVoted,
} from "../modules/civic.receipts/index.js";
import type { VoteResultsProcessState } from "../modules/civic.vote_results/index.js";
import { emitVoteResultsAggregationCompleted } from "../modules/civic.vote_results/events.js";
import { getInputsByProcess } from "../modules/civic.input/index.js";
import { getProcessFactory, getProcessHandler, getActionDispatcher } from "./registry.js";
import { getDb } from "../db/client.js";

/**
 * Return the id of an existing civic.vote_results record for this vote, if one
 * was already spawned. Used to make the close idempotent: the lazy deadline
 * close is triggered from read paths, so two near-simultaneous reads can both
 * try to close the same vote. Without this guard that spawns two vote-results
 * records (two admin queue entries, two board emails). Not a full mutual
 * exclusion (a sub-100ms double-read can still race between this check and the
 * spawn), but it collapses the common window; the tally itself is always
 * correct because it is computed from the append-only vote_records table.
 */
async function findExistingVoteResultsId(
  sourceVoteId: string,
): Promise<string | null> {
  const { data } = await getDb()
    .from("processes")
    .select("id")
    .eq("type", "civic.vote_results")
    .eq("state->>source_process_id", sourceVoteId)
    .maybeSingle();
  return data?.id ?? null;
}
import { isPastDeadline } from "../utils/deadline.js";

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
      vote_method: voteState.method ?? DEFAULT_METHOD,
      vote_starts_at: voteState.voting_opens_at,
      vote_ends_at: voteState.voting_closes_at,
      vote_content: voteProcess.content ?? null,
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
        // For yes_no_unsure: payload.option (string)
        // For approval: payload.selections (string[])
        const methodKey = state.method ?? DEFAULT_METHOD;
        const ballotInput = methodKey === "approval"
          ? action.payload.selections
          : action.payload.option;

        // Ballot secrecy: the module never stores ballots in state, so
        // the previous choice comes from the receipts bridge. A voter
        // with participation but no active key voted before the bridge
        // existed (or the vote closed under them) — refuse the change
        // up front rather than double-counting them as a first vote.
        const previousSerialized = await getActiveChoice(action.actor, process.id);
        if (
          previousSerialized === null &&
          (await hasUserVoted(action.actor, process.id))
        ) {
          throw new Error("You have already voted on this process");
        }

        const outcome = await submitVote(
          state,
          action.actor,
          ballotInput,
          previousSerialized,
          ctx,
        );
        syncStatus(process, outcome.state);

        // Same-ballot re-submit short-circuits in the lifecycle module —
        // no receipt churn needed.
        if (outcome.result.unchanged) {
          result = { ...outcome.result };
          break;
        }

        // Record (or update) the user's receipt. receipt_id stays stable
        // across changes so a previously-shown receipt always verifies
        // to the current choice.
        const method = getVotingMethod(methodKey);
        const serialized = method.serializeForReceipt(outcome.result.ballot as Ballot);
        const receipt = await recordOrUpdateVote(process.id, action.actor, serialized);

        result = {
          ...outcome.result,
          receipt_id: receipt.receipt_id,
          vote_updated: receipt.updated,
        };
        break;
      }
      case "process.close": {
        // Idempotency guard for the lazy-close race: if this vote already has a
        // vote-results record, the close already ran — don't re-tally, re-emit,
        // or spawn a duplicate. Just make sure the status reflects closed.
        const existingResultsId = await findExistingVoteResultsId(process.id);
        if (existingResultsId) {
          if (state.status === "active") {
            state.status = "closed";
            syncStatus(process, state);
          }
          result = { already_closed: true, brief_process_id: existingResultsId };
          break;
        }

        const methodKey = state.method ?? DEFAULT_METHOD;
        const method = getVotingMethod(methodKey);
        const ballots = (await getBallotChoicesForProcess(process.id)).map(
          (c) => method.parseReceipt(c),
        );
        const outcome = await closeVote(state, action.actor, ballots, ctx);
        syncStatus(process, outcome.state);
        result = outcome.result;

        // Drop the user_id ↔ receipt_id bridge so the post-close
        // snapshot retains the strict separation between
        // vote_participation and vote_records.
        await clearActiveVoteKeysForProcess(process.id);

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

  async getReadModel(process: Process, actor?: string): Promise<Record<string, unknown>> {
    const state = getState(process);
    const methodKey = state.method ?? DEFAULT_METHOD;
    const method = getVotingMethod(methodKey);

    // Actor-specific bits come from the receipts tables, never from state.
    const hasVoted = actor
      ? await hasUserVoted(actor, process.id)
      : null;
    const yourSerialized =
      actor && state.status === "active"
        ? await getActiveChoice(actor, process.id)
        : null;

    // Ballots are only needed when results are visible AND no finalized
    // snapshot exists (finalized votes read state.result instead).
    const resultsVisible =
      state.status === "closed" ||
      state.status === "finalized" ||
      hasVoted === true;
    const ballots =
      resultsVisible && !state.result
        ? (await getBallotChoicesForProcess(process.id)).map((c) =>
            method.parseReceipt(c),
          )
        : null;

    const model = getReadModel(state, {
      id: process.id,
      title: process.title,
      description: process.description,
      createdAt: process.createdAt,
      createdBy: process.createdBy,
    }, actor, {
      has_voted: hasVoted,
      your_current_vote:
        yourSerialized !== null ? method.parseReceipt(yourSerialized) : null,
      ballots,
    });

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

  // Lazy deadline-close: an active vote past its voting_closes_at runs the
  // normal close action, which tallies, spawns the vote-results record, and
  // emits the lifecycle events. Dispatched through the injected action
  // dispatcher so the close is persisted exactly as a manual close would be.
  async closeIfExpired(process: Process): Promise<Process> {
    const state = getState(process);
    if (state.status !== "active") return process;
    if (!isPastDeadline(state.voting_closes_at)) return process;

    console.log(
      `[auto-close] Vote ${process.id} expired at ${state.voting_closes_at}, closing now.`,
    );
    const { process: updated } = await getActionDispatcher()(process.id, {
      type: "process.close",
      actor: "system:auto-close",
      payload: {},
    });
    return updated;
  },
};

export default voteProcess;
