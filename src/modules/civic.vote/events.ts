// civic.vote module — event emission helpers
//
// Maps lifecycle transitions and actions to canonical event types.
// Uses the host hub's event emitter via the injected EmitEventFn.
//
// All helpers are async — the host hub durably stores events before
// the promise resolves. Callers must await.

import type { EmitEventFn, VoteProcessState, VoteResult } from "./models.js";

interface EventContext {
  emit: EmitEventFn;
  process_id: string;
  hub_id: string;
  jurisdiction: string;
}

export async function emitProposed(
  ctx: EventContext,
  actor: string,
  state: VoteProcessState,
): Promise<void> {
  await ctx.emit({
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

export async function emitThresholdMet(
  ctx: EventContext,
  actor: string,
  state: VoteProcessState,
): Promise<void> {
  await ctx.emit({
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

export async function emitStarted(
  ctx: EventContext,
  actor: string,
  state: VoteProcessState,
): Promise<void> {
  await ctx.emit({
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

export async function emitVoteSubmitted(
  ctx: EventContext,
  actor: string,
  option: string,
  previous_vote: string | null,
): Promise<void> {
  await ctx.emit({
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

export async function emitEnded(
  ctx: EventContext,
  actor: string,
  result: VoteResult,
): Promise<void> {
  await ctx.emit({
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

/**
 * Emit the Phase 4 (Aggregation) event. Per Civic Event Spec §7.6 and
 * Civic Process Spec §9, this fires when raw participant inputs have been
 * processed into structured results. For civic.vote, tallying IS the
 * aggregation step, so this fires alongside `ended`.
 */
export async function emitAggregationCompleted(
  ctx: EventContext,
  actor: string,
  result: VoteResult,
  participant_count: number,
): Promise<void> {
  await ctx.emit({
    event_type: "civic.process.aggregation_completed",
    actor,
    process_id: ctx.process_id,
    hub_id: ctx.hub_id,
    jurisdiction: ctx.jurisdiction,
    data: {
      aggregation_method: "tallying",
      participant_count,
      result_type: "tally",
      result_summary: summarizeTally(result),
    },
  });
}

function summarizeTally(result: VoteResult): string {
  const entries = Object.entries(result.tally).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0 || result.total_votes === 0) {
    return "No votes recorded.";
  }
  const [topOption, topCount] = entries[0];
  const pct = Math.round((topCount / result.total_votes) * 100);
  return `${topOption}: ${topCount} of ${result.total_votes} (${pct}%)`;
}

export async function emitResultPublished(
  ctx: EventContext,
  actor: string,
  result: VoteResult,
): Promise<void> {
  await ctx.emit({
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
