// civic.brief module — event emission helpers
//
// Maps lifecycle transitions and admin actions to canonical event types
// per Civic Event Spec v0.1 §7. All events emitted through the host hub's
// emit callback, which handles ID, timestamp, source, and URL construction.

import type { BriefProcessContext, BriefProcessState } from "./models.js";

function briefPath(process_id: string): string {
  return `/brief/${process_id}`;
}

export async function emitBriefCreated(
  ctx: BriefProcessContext,
  actor: string,
  state: BriefProcessState,
): Promise<void> {
  await ctx.emit({
    event_type: "civic.process.created",
    actor,
    process_id: ctx.process_id,
    hub_id: ctx.hub_id,
    jurisdiction: ctx.jurisdiction,
    action_url_path: briefPath(ctx.process_id),
    data: {
      process: {
        type: "civic.brief",
        title: state.content.title,
        source_process_id: state.source_process_id,
      },
    },
  });
}

/**
 * Emitted immediately after brief creation. The brief's aggregation step
 * is the generation of structured content from the underlying vote; it
 * completes synchronously at creation time, so the event fires together
 * with `created`.
 */
export async function emitBriefAggregationCompleted(
  ctx: BriefProcessContext,
  actor: string,
  state: BriefProcessState,
): Promise<void> {
  await ctx.emit({
    event_type: "civic.process.aggregation_completed",
    actor,
    process_id: ctx.process_id,
    hub_id: ctx.hub_id,
    jurisdiction: ctx.jurisdiction,
    action_url_path: briefPath(ctx.process_id),
    data: {
      aggregation_method: "summarization",
      participant_count: state.content.participation_count,
      result_type: "summary",
      result_summary: summarizePositions(state),
    },
  });
}

export async function emitBriefUpdated(
  ctx: BriefProcessContext,
  actor: string,
  state: BriefProcessState,
): Promise<void> {
  await ctx.emit({
    event_type: "civic.process.updated",
    actor,
    process_id: ctx.process_id,
    hub_id: ctx.hub_id,
    jurisdiction: ctx.jurisdiction,
    action_url_path: briefPath(ctx.process_id),
    data: {
      brief: {
        publication_status: state.publication_status,
        concerns_count: state.content.concerns.length,
        suggestions_count: state.content.suggestions.length,
        has_admin_notes: state.content.admin_notes.trim().length > 0,
      },
    },
  });
}

/**
 * Phase 5 (Outcome / Decision) event per Civic Process Spec §10. The brief
 * records the advisory outcome of the linked vote.
 */
export async function emitBriefOutcomeRecorded(
  ctx: BriefProcessContext,
  actor: string,
  state: BriefProcessState,
): Promise<void> {
  await ctx.emit({
    event_type: "civic.process.outcome_recorded",
    actor,
    process_id: ctx.process_id,
    hub_id: ctx.hub_id,
    jurisdiction: ctx.jurisdiction,
    action_url_path: briefPath(ctx.process_id),
    data: {
      outcome_type: "advisory",
      outcome_description: summarizePositions(state),
      linked_process_id: state.source_process_id,
    },
  });
}

/**
 * Phase 6 (Publication) event per Civic Process Spec §6. Makes the brief
 * visible to the public feed. The feed renders this as a "Civic Brief
 * delivered: [title]" post.
 */
export async function emitBriefResultPublished(
  ctx: BriefProcessContext,
  actor: string,
  state: BriefProcessState,
): Promise<void> {
  await ctx.emit({
    event_type: "civic.process.result_published",
    actor,
    process_id: ctx.process_id,
    hub_id: ctx.hub_id,
    jurisdiction: ctx.jurisdiction,
    action_url_path: briefPath(ctx.process_id),
    data: {
      brief_id: ctx.process_id,
      source_process_id: state.source_process_id,
      participation_count: state.content.participation_count,
      headline_result: summarizePositions(state),
    },
  });
}

function summarizePositions(state: BriefProcessState): string {
  const positions = state.content.position_breakdown;
  if (positions.length === 0 || state.content.participation_count === 0) {
    return "No participation recorded.";
  }
  const top = positions[0];
  return `${top.option_label}: ${top.count} of ${state.content.participation_count} (${top.percentage}%)`;
}
