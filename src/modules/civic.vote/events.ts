// civic.vote module — event emission helpers
//
// Maps lifecycle transitions and actions to canonical event types.
// Uses the host hub's event emitter via the injected EmitEventFn.

import type { EmitEventFn, VoteProcessState, VoteResult } from "./models.js";

interface EventContext {
  emit: EmitEventFn;
  process_id: string;
  hub_id: string;
  jurisdiction: string;
}

export function emitProposed(
  ctx: EventContext,
  actor: string,
  state: VoteProcessState
): void {
  ctx.emit({
    event_type: "civic.process.proposed",
    actor,
    process_id: ctx.process_id,
    hub_id: ctx.hub_id,
    jurisdiction: ctx.jurisdiction,
    data: {
      process: {
        options: state.options,
        support_threshold: state.config.support_threshold,
      },
    },
  });
}

export function emitThresholdMet(
  ctx: EventContext,
  actor: string,
  state: VoteProcessState
): void {
  ctx.emit({
    event_type: "civic.process.threshold_met",
    actor,
    process_id: ctx.process_id,
    hub_id: ctx.hub_id,
    jurisdiction: ctx.jurisdiction,
    data: {
      process: {
        support_count: state.support_count,
        support_threshold: state.config.support_threshold,
      },
    },
  });
}

export function emitStarted(
  ctx: EventContext,
  actor: string,
  state: VoteProcessState
): void {
  ctx.emit({
    event_type: "civic.process.started",
    actor,
    process_id: ctx.process_id,
    hub_id: ctx.hub_id,
    jurisdiction: ctx.jurisdiction,
    data: {
      process: {
        voting_opens_at: state.voting_opens_at,
        voting_closes_at: state.voting_closes_at,
        options: state.options,
      },
    },
  });
}

export function emitVoteSubmitted(
  ctx: EventContext,
  actor: string,
  option: string,
  previous_vote: string | null
): void {
  ctx.emit({
    event_type: "civic.process.vote_submitted",
    actor,
    process_id: ctx.process_id,
    hub_id: ctx.hub_id,
    jurisdiction: ctx.jurisdiction,
    data: {
      vote: { option, previous_vote },
    },
  });
}

export function emitEnded(
  ctx: EventContext,
  actor: string,
  result: VoteResult
): void {
  ctx.emit({
    event_type: "civic.process.ended",
    actor,
    process_id: ctx.process_id,
    hub_id: ctx.hub_id,
    jurisdiction: ctx.jurisdiction,
    data: {
      result: {
        tally: result.tally,
        total_votes: result.total_votes,
      },
    },
  });
}

export function emitResultPublished(
  ctx: EventContext,
  actor: string,
  result: VoteResult
): void {
  ctx.emit({
    event_type: "civic.process.result_published",
    actor,
    process_id: ctx.process_id,
    hub_id: ctx.hub_id,
    jurisdiction: ctx.jurisdiction,
    data: {
      result: {
        tally: result.tally,
        total_votes: result.total_votes,
        computed_at: result.computed_at,
      },
    },
  });
}
