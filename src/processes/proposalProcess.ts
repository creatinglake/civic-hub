// civic.proposal process handler — structured idea promotion.
//
// Proposals allow users to suggest ideas. When enough supporters back a
// proposal (support_count >= support_threshold), it automatically converts
// into a civic.vote process for formal decision-making.
//
// Actions: proposal.support
// Lifecycle: open → (threshold reached) → closed + new civic.vote created

import { Process, ProcessAction } from "../models/process.js";
import { emitEvent } from "../events/eventEmitter.js";
import { ProcessHandler } from "./types.js";
import { getProcessFactory } from "./registry.js";

// --- State types ---

interface ProposalState {
  type: string;
  proposed_options: string[];
  supporters: Record<string, boolean>;
  support_count: number;
  support_threshold: number;
  status: "open" | "closed";
  promoted_vote_id: string | null;
  [key: string]: unknown;
}

/** Default support threshold before promotion to vote */
const DEFAULT_SUPPORT_THRESHOLD = 3;

// --- Handler implementation ---

const proposalProcess: ProcessHandler = {
  type: "civic.proposal",

  initializeState(input: Record<string, unknown>): ProposalState {
    const proposed_options =
      (input.proposed_options as string[]) ??
      (input.options as string[]) ??
      ["yes", "no"];
    const threshold =
      (input.support_threshold as number) ?? DEFAULT_SUPPORT_THRESHOLD;

    return {
      type: "civic.proposal",
      proposed_options,
      supporters: {},
      support_count: 0,
      support_threshold: threshold,
      status: "open",
      promoted_vote_id: null,
    };
  },

  handleAction(
    process: Process,
    action: ProcessAction
  ): Record<string, unknown> {
    const state = process.state as unknown as ProposalState;

    switch (action.type) {
      case "proposal.support":
        return supportProposal(process, state, action);
      default:
        throw new Error(
          `Unknown action type for civic.proposal: ${action.type}`
        );
    }
  },

  getReadModel(
    process: Process,
    actor?: string
  ): Record<string, unknown> {
    const state = process.state as unknown as ProposalState;

    return {
      id: process.id,
      type: process.definition.type,
      title: process.title,
      description: process.description,
      status: process.status,
      proposed_options: state.proposed_options,
      support_count: state.support_count,
      support_threshold: state.support_threshold,
      has_supported: actor ? actor in state.supporters : null,
      promoted_vote_id: state.promoted_vote_id,
      created_at: process.createdAt,
      created_by: process.createdBy,
    };
  },

  getSummary(process: Process): Record<string, unknown> {
    const state = process.state as unknown as ProposalState;

    return {
      id: process.id,
      type: process.definition.type,
      title: process.title,
      status: process.status,
      support_count: state.support_count,
      support_threshold: state.support_threshold,
      created_at: process.createdAt,
      created_by: process.createdBy,
    };
  },
};

// --- Internal action handlers ---

function supportProposal(
  process: Process,
  state: ProposalState,
  action: ProcessAction
): Record<string, unknown> {
  if (state.status === "closed") {
    throw new Error("Cannot support proposal: proposal is closed");
  }

  if (state.supporters[action.actor]) {
    throw new Error("You have already supported this proposal");
  }

  state.supporters[action.actor] = true;
  state.support_count += 1;

  emitEvent({
    type: "proposal.supported",
    actor: action.actor,
    object: {
      type: "civic.proposal",
      support_count: state.support_count,
      support_threshold: state.support_threshold,
    },
    context: { process_id: process.id, hub_id: process.hubId },
  });

  // Check if threshold reached — promote to vote
  if (state.support_count >= state.support_threshold) {
    return promoteToVote(process, state, action);
  }

  return { support_count: state.support_count };
}

/**
 * Promote a proposal to a civic.vote process.
 * Called internally when the support threshold is reached.
 * Uses the process factory (injected by service layer) to create the new vote.
 */
function promoteToVote(
  process: Process,
  state: ProposalState,
  action: ProcessAction
): Record<string, unknown> {
  // Emit threshold reached
  emitEvent({
    type: "proposal.threshold_reached",
    actor: action.actor,
    object: {
      type: "civic.proposal",
      support_count: state.support_count,
      support_threshold: state.support_threshold,
    },
    context: { process_id: process.id, hub_id: process.hubId },
  });

  // Create the vote using the injected factory
  const createProcess = getProcessFactory();

  const vote = createProcess({
    definition: { type: "civic.vote", version: "0.1" },
    title: process.title,
    description: process.description,
    createdBy: process.createdBy,
    hubId: process.hubId,
    state: { options: state.proposed_options },
  });

  state.promoted_vote_id = vote.id;

  // Emit promotion event
  emitEvent({
    type: "proposal.promoted_to_vote",
    actor: action.actor,
    object: {
      type: "civic.proposal",
      vote_id: vote.id,
      vote_title: vote.title,
    },
    context: { process_id: process.id, hub_id: process.hubId },
  });

  // Close the proposal
  process.status = "closed";
  state.status = "closed";

  return {
    support_count: state.support_count,
    promoted_vote_id: vote.id,
  };
}

export default proposalProcess;
