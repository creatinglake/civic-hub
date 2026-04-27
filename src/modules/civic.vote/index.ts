// civic.vote module — service interface
//
// This module is self-contained and portable across hubs.
// It exposes pure service functions that operate on VoteProcessState.
// No route handlers, no UI logic, no direct hub imports.
//
// The host hub provides:
//   - a VoteConfig object
//   - an EmitEventFn callback for event emission
//
// Action functions are async because event emission is durable — the host
// hub awaits the DB write before the action completes.

import type {
  VoteConfig,
  VoteProcessState,
  EmitEventFn,
  ActionOutcome,
} from "./models.js";
import { assertTransition, isVotingOpen, isAcceptingSupport, isTerminal } from "./lifecycle.js";
import { computeTally } from "./results.js";
import {
  emitProposed,
  emitThresholdMet,
  emitStarted,
  emitVoteSubmitted,
  emitEnded,
  emitAggregationCompleted,
  emitResultPublished,
} from "./events.js";

export type { VoteConfig, VoteProcessState, VoteResult, EmitEventFn, ActionOutcome } from "./models.js";
export { canTransition, isVotingOpen, isAcceptingSupport, isTerminal } from "./lifecycle.js";
export { computeTally } from "./results.js";

// --- Process Descriptor ---
// Static metadata describing the civic.vote process type, its lifecycle,
// available actions, and configuration schema. Exposed for discovery endpoints.

export const PROCESS_DESCRIPTOR = {
  type: "civic.vote",
  version: "0.1",
  lifecycle: {
    states: ["draft", "proposed", "threshold_met", "active", "closed", "finalized"],
    paths: {
      direct: ["draft", "active", "closed", "finalized"],
      proposal_required: ["draft", "proposed", "threshold_met", "active", "closed", "finalized"],
    },
  },
  actions: [
    { name: "process.propose", from: ["draft"], to: "proposed", description: "Submit for community support" },
    { name: "process.support", from: ["proposed"], to: null, description: "Endorse a proposed vote" },
    { name: "process.unsupport", from: ["proposed"], to: null, description: "Remove endorsement (only before threshold is met)" },
    { name: "process.activate", from: ["draft", "threshold_met"], to: "active", description: "Open the voting window" },
    { name: "process.vote", from: ["active"], to: null, description: "Cast or change a vote" },
    { name: "process.close", from: ["active"], to: "closed", description: "End the voting window; aggregation runs immediately" },
  ],
  config_schema: {
    support_threshold: { type: "number", default: 3, description: "Endorsements required before activation" },
    voting_duration_ms: { type: "number", default: 259200000, description: "Voting window duration in milliseconds (default: 3 days)" },
    activation_mode: { type: "string", enum: ["direct", "proposal_required"], default: "direct", description: "Controls which lifecycle path is available" },
  },
  events: [
    "civic.process.proposed",
    "civic.process.threshold_met",
    "civic.process.started",
    "civic.process.vote_submitted",
    "civic.process.ended",
    "civic.process.aggregation_completed",
    "civic.process.result_published",
  ],
} as const;

/** Default voting window: 3 days */
const DEFAULT_VOTING_DURATION_MS = 3 * 24 * 60 * 60 * 1000;
const DEFAULT_SUPPORT_THRESHOLD = 3;

// --- Factory ---

export function createVoteState(
  input: Record<string, unknown>,
  config?: Partial<VoteConfig>
): VoteProcessState {
  const options = (input.options as string[]) ?? ["yes", "no"];

  return {
    type: "civic.vote",
    status: "draft",
    options,
    votes: {},
    supporters: {},
    support_count: 0,
    config: {
      support_threshold: config?.support_threshold
        ?? (input.support_threshold as number | undefined)
        ?? DEFAULT_SUPPORT_THRESHOLD,
      voting_duration_ms: config?.voting_duration_ms
        ?? (input.voting_duration_ms as number | undefined)
        ?? DEFAULT_VOTING_DURATION_MS,
      activation_mode: config?.activation_mode
        ?? (input.activation_mode as "direct" | "proposal_required" | undefined)
        ?? "direct",
    },
    voting_opens_at: null,
    voting_closes_at: null,
    result: null,
  };
}

// --- Event context helper ---

interface ProcessContext {
  process_id: string;
  hub_id: string;
  jurisdiction: string;
  emit: EmitEventFn;
}

// --- Actions ---

/**
 * Propose a vote for community support.
 * Transition: draft → proposed
 */
export async function propose(
  state: VoteProcessState,
  actor: string,
  ctx: ProcessContext
): Promise<ActionOutcome> {
  assertTransition(state.status, "proposed", state.config.activation_mode);
  state.status = "proposed";

  await emitProposed(ctx, actor, state);

  return { state, result: { status: "proposed" } };
}

/**
 * Add support/endorsement to a proposed vote.
 * May trigger proposed → threshold_met (and auto-activation if configured).
 */
export async function addSupport(
  state: VoteProcessState,
  actor: string,
  ctx: ProcessContext
): Promise<ActionOutcome> {
  if (!isAcceptingSupport(state.status)) {
    throw new Error(`Cannot support: process is in "${state.status}" state, not "proposed"`);
  }

  if (state.supporters[actor]) {
    throw new Error("You have already supported this proposal");
  }

  state.supporters[actor] = true;
  state.support_count += 1;

  // Check threshold
  if (state.support_count >= state.config.support_threshold) {
    assertTransition(state.status, "threshold_met", state.config.activation_mode);
    state.status = "threshold_met";

    await emitThresholdMet(ctx, actor, state);

    // In proposal_required mode, auto-activate once threshold is met.
    // In direct mode, this path is unreachable (draft → active skips proposal).
    if (state.config.activation_mode === "proposal_required") {
      return activate(state, actor, ctx);
    }

    return {
      state,
      result: {
        support_count: state.support_count,
        threshold_met: true,
      },
    };
  }

  return {
    state,
    result: { support_count: state.support_count },
  };
}

/**
 * Remove support/endorsement from a proposed vote.
 * Only allowed while the process is in "proposed" state (before threshold is met).
 * Once threshold_met or active, endorsements are locked.
 */
export async function removeSupport(
  state: VoteProcessState,
  actor: string,
  _ctx: ProcessContext
): Promise<ActionOutcome> {
  if (!isAcceptingSupport(state.status)) {
    throw new Error(
      `Cannot remove endorsement: process is in "${state.status}" state. ` +
      `Endorsements can only be removed while the proposal is gathering support.`
    );
  }

  if (!state.supporters[actor]) {
    throw new Error("You have not endorsed this proposal");
  }

  delete state.supporters[actor];
  state.support_count -= 1;

  return {
    state,
    result: { support_count: state.support_count, removed: true },
  };
}

/**
 * Activate the vote — opens the voting window.
 * Transition: draft → active (direct) or threshold_met → active
 */
export async function activate(
  state: VoteProcessState,
  actor: string,
  ctx: ProcessContext
): Promise<ActionOutcome> {
  assertTransition(state.status, "active", state.config.activation_mode);

  const now = new Date();
  state.status = "active";
  state.voting_opens_at = now.toISOString();
  state.voting_closes_at = new Date(
    now.getTime() + state.config.voting_duration_ms
  ).toISOString();

  await emitStarted(ctx, actor, state);

  return {
    state,
    result: {
      status: "active",
      voting_opens_at: state.voting_opens_at,
      voting_closes_at: state.voting_closes_at,
    },
  };
}

/**
 * Submit a vote during the active period.
 */
export async function submitVote(
  state: VoteProcessState,
  actor: string,
  option: string,
  ctx: ProcessContext
): Promise<ActionOutcome> {
  if (!isVotingOpen(state.status)) {
    throw new Error(`Cannot submit vote: process is in "${state.status}" state, not "active"`);
  }

  // Auto-close if voting window has expired
  if (state.voting_closes_at && new Date() > new Date(state.voting_closes_at)) {
    state.status = "closed";
    throw new Error("Cannot submit vote: voting window has expired");
  }

  if (!option) {
    throw new Error("process.vote requires payload.option");
  }

  if (!state.options.includes(option)) {
    throw new Error(
      `Invalid option "${option}". Valid options: ${state.options.join(", ")}`
    );
  }

  const previous_vote = state.votes[actor] ?? null;
  state.votes[actor] = option;

  await emitVoteSubmitted(ctx, actor, option, previous_vote);

  return { state, result: { option, previous_vote } };
}

/**
 * Close the vote — ends the voting window and runs aggregation.
 * Transition: active → closed
 *
 * Emits Phase 3→4 boundary events: `ended` (participation closed) and
 * `aggregation_completed` (tally produced). Does NOT emit
 * `result_published` — that only fires once an accompanying
 * civic.vote_results record (formerly civic.brief, pre-Slice-8.5) has
 * been approved by an admin, via finalizeVote().
 */
export async function closeVote(
  state: VoteProcessState,
  actor: string,
  ctx: ProcessContext
): Promise<ActionOutcome> {
  assertTransition(state.status, "closed", state.config.activation_mode);

  state.status = "closed";
  const result = computeTally(state.votes, state.options);
  // Tally is computed over distinct voter identities (keys of state.votes),
  // so participant_count == Object.keys(state.votes).length.
  const participantCount = Object.keys(state.votes).length;

  await emitEnded(ctx, actor, result);
  await emitAggregationCompleted(ctx, actor, result, participantCount);

  return {
    state,
    result: { tally: result.tally, total_votes: result.total_votes },
  };
}

/**
 * Finalize the vote — publish the result.
 * Transition: closed → finalized
 *
 * Library-only entry point: there is no HTTP action wired to this. The
 * civic.vote_results module's approval flow calls this directly once an
 * admin has reviewed and approved the accompanying record. Result
 * publication is therefore gated on admin approval; no caller outside
 * the vote-results flow should be able to reach this function.
 */
export async function finalizeVote(
  state: VoteProcessState,
  actor: string,
  ctx: ProcessContext
): Promise<ActionOutcome> {
  assertTransition(state.status, "finalized", state.config.activation_mode);

  const result = computeTally(state.votes, state.options);
  state.status = "finalized";
  state.result = result;

  await emitResultPublished(ctx, actor, result);

  return {
    state,
    result: {
      tally: result.tally,
      total_votes: result.total_votes,
      computed_at: result.computed_at,
    },
  };
}

// --- Read models ---

export function getReadModel(
  state: VoteProcessState,
  processMeta: { id: string; title: string; description: string; createdAt: string; createdBy: string },
  actor?: string
): Record<string, unknown> {
  const tally = computeTally(state.votes, state.options);
  const hasVoted = actor ? actor in state.votes : null;
  const hasSupported = actor ? actor in state.supporters : null;

  // Results visible after voting, when closed, or when finalized
  const showResults =
    state.status === "closed" ||
    state.status === "finalized" ||
    hasVoted === true;

  return {
    id: processMeta.id,
    type: "civic.vote",
    title: processMeta.title,
    description: processMeta.description,
    status: state.status,
    options: state.options,
    tally: showResults ? tally.tally : null,
    total_votes: showResults ? tally.total_votes : null,
    has_voted: hasVoted,
    has_supported: hasSupported,
    support_count: state.support_count,
    support_threshold: state.config.support_threshold,
    activation_mode: state.config.activation_mode,
    voting_opens_at: state.voting_opens_at,
    voting_closes_at: state.voting_closes_at,
    closes_at: state.voting_closes_at, // backward compat alias
    result: state.status === "finalized" ? state.result : null,
    created_at: processMeta.createdAt,
    created_by: processMeta.createdBy,
  };
}

export function getSummary(
  state: VoteProcessState,
  processMeta: { id: string; title: string; createdAt: string; createdBy: string; status: string }
): Record<string, unknown> {
  return {
    id: processMeta.id,
    type: "civic.vote",
    title: processMeta.title,
    status: processMeta.status,
    total_votes: Object.keys(state.votes).length,
    support_count: state.support_count,
    support_threshold: state.config.support_threshold,
    closes_at: state.voting_closes_at,
    created_at: processMeta.createdAt,
    created_by: processMeta.createdBy,
  };
}
