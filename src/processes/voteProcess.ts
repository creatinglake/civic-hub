// civic.vote process handler — implements advisory voting.
//
// This handler encapsulates all vote-specific logic:
//   - state initialization (options, voting window)
//   - actions: vote.submit, vote.close
//   - read model with result visibility rules
//   - list summary with vote count and close date

import { Process, ProcessAction } from "../models/process.js";
import { emitEvent } from "../events/eventEmitter.js";
import { ProcessHandler } from "./types.js";

// --- State types ---

interface VotingWindow {
  opens_at: string;
  closes_at: string;
}

interface VoteState {
  type: string;
  options: string[];
  votes: Record<string, string>;
  status: "open" | "closed";
  voting: VotingWindow;
  [key: string]: unknown;
}

/** Default voting window: 3 days */
const VOTING_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

// --- Handler implementation ---

const voteProcess: ProcessHandler = {
  type: "civic.vote",

  initializeState(input: Record<string, unknown>): VoteState {
    const options = (input.options as string[]) ?? ["yes", "no"];
    const now = new Date();

    return {
      type: "civic.vote",
      options,
      votes: {},
      status: "open",
      voting: {
        opens_at: now.toISOString(),
        closes_at: new Date(now.getTime() + VOTING_WINDOW_MS).toISOString(),
      },
    };
  },

  handleAction(process: Process, action: ProcessAction): Record<string, unknown> {
    const state = process.state as unknown as VoteState;

    switch (action.type) {
      case "vote.submit":
        return submitVote(process, state, action);
      case "vote.close":
        return closeVote(process, state, action);
      default:
        throw new Error(`Unknown action type for civic.vote: ${action.type}`);
    }
  },

  getReadModel(process: Process, actor?: string): Record<string, unknown> {
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

    // Results visible only after voting or when closed
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
  },

  getSummary(process: Process): Record<string, unknown> {
    const state = process.state as unknown as VoteState;

    return {
      id: process.id,
      type: process.definition.type,
      title: process.title,
      status: process.status,
      total_votes: Object.keys(state.votes).length,
      closes_at: state.voting?.closes_at ?? null,
      created_at: process.createdAt,
      created_by: process.createdBy,
    };
  },
};

// --- Internal action handlers ---

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

export default voteProcess;
