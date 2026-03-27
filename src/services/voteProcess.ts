// Vote process handler — implements "civic.vote" (advisory vote)
// Handles vote submission and closing.
//
// This module is kept modular so it can evolve into a plugin later.

import { Process, ProcessAction } from "../models/process.js";
import { emitEvent } from "../events/eventEmitter.js";

export interface VoteState {
  type: string; // "civic.vote"
  options: string[];
  votes: Record<string, string>; // actor -> selected option
  status: "open" | "closed";
  [key: string]: unknown; // index signature for Record<string, unknown> compatibility
}

export function initializeVoteState(
  input: Record<string, unknown>
): VoteState {
  const options = (input.options as string[]) ?? ["yes", "no"];
  return {
    type: "civic.vote",
    options,
    votes: {},
    status: "open",
  };
}

export function handleVoteAction(
  process: Process,
  action: ProcessAction
): Record<string, unknown> {
  const state = process.state as unknown as VoteState;

  switch (action.type) {
    case "vote.submit":
      return submitVote(process, state, action);
    case "vote.close":
      return closeVote(process, state, action);
    default:
      throw new Error(`Unknown action type for civic.vote: ${action.type}`);
  }
}

function submitVote(
  process: Process,
  state: VoteState,
  action: ProcessAction
): Record<string, unknown> {
  if (state.status === "closed") {
    throw new Error("Cannot submit vote: process is closed");
  }

  const option = action.payload.option as string;

  if (!option) {
    throw new Error("vote.submit requires payload.option");
  }

  if (!state.options.includes(option)) {
    throw new Error(
      `Invalid option "${option}". Valid options: ${state.options.join(", ")}`
    );
  }

  const previous_vote = state.votes[action.actor] ?? null;
  state.votes[action.actor] = option;

  emitEvent({
    type: "vote.submitted",
    actor: action.actor,
    object: { type: "civic.vote", option, previous_vote },
    context: { process_id: process.id, hub_id: process.hubId },
  });

  return { option, previous_vote };
}

function closeVote(
  process: Process,
  state: VoteState,
  action: ProcessAction
): Record<string, unknown> {
  if (state.status === "closed") {
    throw new Error("Cannot close vote: process is already closed");
  }

  process.status = "closed";
  state.status = "closed";

  // Tally results
  const tally: Record<string, number> = {};
  for (const opt of state.options) {
    tally[opt] = 0;
  }
  for (const vote of Object.values(state.votes)) {
    tally[vote] = (tally[vote] ?? 0) + 1;
  }

  const total_votes = Object.keys(state.votes).length;

  emitEvent({
    type: "vote.closed",
    actor: action.actor,
    object: { type: "civic.vote.result", tally, total_votes },
    context: { process_id: process.id, hub_id: process.hubId },
  });

  return { tally, total_votes };
}

/**
 * Compute a UI-friendly read view of a vote process.
 * Derives tally from current votes — no extra storage needed.
 */
export function getVoteState(process: Process): Record<string, unknown> {
  const state = process.state as unknown as VoteState;

  const tally: Record<string, number> = {};
  for (const opt of state.options) {
    tally[opt] = 0;
  }
  for (const vote of Object.values(state.votes)) {
    tally[vote] = (tally[vote] ?? 0) + 1;
  }

  return {
    id: process.id,
    type: process.definition.type,
    title: process.title,
    description: process.description,
    status: process.status,
    options: state.options,
    tally,
    total_votes: Object.keys(state.votes).length,
    created_at: process.createdAt,
    created_by: process.createdBy,
  };
}
