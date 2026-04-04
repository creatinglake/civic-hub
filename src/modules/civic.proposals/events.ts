// civic.proposals module — event emission helpers
//
// All events flow through the hub's centralized emitEvent().
// These helpers provide typed wrappers for proposal-specific events.
//
// GUARDRAIL: This module MUST NOT import from civic.vote.

import type { CreateEventInput } from "../../models/event.js";

export type EmitEventFn = (input: CreateEventInput) => void;

const HUB_ID = "civic-hub-local";

interface EventContext {
  proposal_id: string;
  hub_id?: string;
  jurisdiction?: string;
  emit: EmitEventFn;
}

export function emitProposalSubmitted(
  ctx: EventContext,
  actor: string,
  data: { title: string }
): void {
  ctx.emit({
    event_type: "civic.proposal.submitted",
    actor,
    process_id: ctx.proposal_id,
    hub_id: ctx.hub_id ?? HUB_ID,
    jurisdiction: ctx.jurisdiction ?? "local",
    data: { proposal: data },
  });
}

export function emitProposalSupported(
  ctx: EventContext,
  actor: string,
  data: { support_count: number; support_threshold: number }
): void {
  ctx.emit({
    event_type: "civic.proposal.supported",
    actor,
    process_id: ctx.proposal_id,
    hub_id: ctx.hub_id ?? HUB_ID,
    jurisdiction: ctx.jurisdiction ?? "local",
    data: { proposal: data },
  });
}

export function emitProposalEndorsed(
  ctx: EventContext,
  actor: string,
  data: { support_count: number; support_threshold: number }
): void {
  ctx.emit({
    event_type: "civic.proposal.endorsed",
    actor,
    process_id: ctx.proposal_id,
    hub_id: ctx.hub_id ?? HUB_ID,
    jurisdiction: ctx.jurisdiction ?? "local",
    data: { proposal: data },
  });
}

export function emitProposalConverted(
  ctx: EventContext,
  actor: string,
  data: { vote_process_id: string; vote_title: string }
): void {
  ctx.emit({
    event_type: "civic.proposal.converted",
    actor,
    process_id: ctx.proposal_id,
    hub_id: ctx.hub_id ?? HUB_ID,
    jurisdiction: ctx.jurisdiction ?? "local",
    data: { proposal: data },
  });
}
