// Vote process handler — implements "civic.vote" (advisory vote)
// Handles vote submission and closing

import { Process, ProcessAction } from "../models/process.js";
import { emitEvent } from "../events/eventEmitter.js";

export interface VoteState {
  options: string[];
  votes: Record<string, string>; // actor -> selected option
  [key: string]: unknown; // index signature for Record<string, unknown> compatibility
}

export function initializeVoteState(
  input: Record<string, unknown>
): VoteState {
  const options = (input.options as string[]) ?? ["yes", "no"];
  return {
    options,
    votes: {},
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
  const option = action.payload.option as string;

  if (!option) {
    throw new Error("vote.submit requires payload.option");
  }

  if (!state.options.includes(option)) {
    throw new Error(
      `Invalid option "${option}". Valid options: ${state.options.join(", ")}`
    );
  }

  const previousVote = state.votes[action.actor];
  state.votes[action.actor] = option;

  emitEvent({
    type: "vote.submitted",
    actor: action.actor,
    object: { type: "civic.process", id: process.id },
    context: { hubId: process.hubId, processId: process.id },
    data: { option, previousVote: previousVote ?? null },
  });

  return { option, previousVote: previousVote ?? null };
}

function closeVote(
  process: Process,
  state: VoteState,
  action: ProcessAction
): Record<string, unknown> {
  process.status = "closed";

  // Tally results
  const tally: Record<string, number> = {};
  for (const opt of state.options) {
    tally[opt] = 0;
  }
  for (const vote of Object.values(state.votes)) {
    tally[vote] = (tally[vote] ?? 0) + 1;
  }

  emitEvent({
    type: "vote.closed",
    actor: action.actor,
    object: { type: "civic.process", id: process.id },
    context: { hubId: process.hubId, processId: process.id },
    data: { tally, totalVotes: Object.keys(state.votes).length },
  });

  return { tally, totalVotes: Object.keys(state.votes).length };
}
