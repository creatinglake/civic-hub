// Vote process handler — implements "civic.vote" (advisory vote)
// Handles vote submission and closing.
//
// This module is kept modular so it can evolve into a plugin later.

import { Process, ProcessAction } from "../models/process.js";
import { emitEvent } from "../events/eventEmitter.js";

export interface VotingWindow {
  opens_at: string; // ISO timestamp
  closes_at: string; // ISO timestamp
}

export interface VoteState {
  type: string; // "civic.vote"
  options: string[];
  votes: Record<string, string>; // actor -> selected option
  status: "open" | "closed";
  voting: VotingWindow;
  [key: string]: unknown; // index signature for Record<string, unknown> compatibility
}

/** Default voting window duration: 3 days */
const VOTING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export function initializeVoteState(
  input: Record<string, unknown>
): VoteState {
  const options = (input.options as string[]) ?? ["yes", "no"];
  const now = new Date();
  const opensAt = now.toISOString();
  const closesAt = new Date(now.getTime() + VOTING_WINDOW_MS).toISOString();

  return {
    type: "civic.vote",
    options,
    votes: {},
    status: "open",
    voting: {
      opens_at: opensAt,
      closes_at: closesAt,
    },
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
    throw new Error("Cannot submit vote: voting is closed");
  }

  // Auto-close if voting window has expired
  if (new Date() > new Date(state.voting.closes_at)) {
    process.status = "closed";
    state.status = "closed";
    throw new Error("Cannot submit vote: voting window has expired");
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
 * If actor is provided, includes has_voted flag and hides tally if they haven't voted.
 */
export function getVoteState(process: Process, actor?: string): Record<string, unknown> {
  const state = process.state as unknown as VoteState;

  const tally: Record<string, number> = {};
  for (const opt of state.options) {
    tally[opt] = 0;
  }
  for (const vote of Object.values(state.votes)) {
    tally[vote] = (tally[vote] ?? 0) + 1;
  }

  const totalVotes = Object.keys(state.votes).length;
  const hasVoted = actor ? actor in state.votes : null;

  // Results are only visible if the user has voted, or the vote is closed
  const showResults = process.status === "closed" || hasVoted === true;

  return {
    id: process.id,
    type: process.definition.type,
    title: process.title,
    description: process.description,
    status: process.status,
    options: state.options,
    tally: showResults ? tally : null,
    total_votes: showResults ? totalVotes : null,
    has_voted: hasVoted,
    closes_at: state.voting.closes_at,
    created_at: process.createdAt,
    created_by: process.createdBy,
  };
}
