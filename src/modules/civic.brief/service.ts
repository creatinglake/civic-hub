// civic.brief module — service functions (pure / orchestration)
//
// Pure state transitions and the approval orchestration sequence. No I/O
// lives here beyond what the injected callbacks perform. The host hub is
// responsible for persisting state changes after these functions return.

import type {
  BriefActionOutcome,
  BriefContent,
  BriefContentPatch,
  BriefProcessContext,
  BriefProcessState,
  CreateBriefFromVoteInput,
  FinalizeLinkedVoteFn,
  SendEmailFn,
} from "./models.js";
import { assertPublicationTransition, canApprove, canEdit } from "./lifecycle.js";
import {
  emitBriefAggregationCompleted,
  emitBriefCreated,
  emitBriefOutcomeRecorded,
  emitBriefResultPublished,
  emitBriefUpdated,
} from "./events.js";
import { formatBriefEmail } from "./email.js";

/**
 * Build the initial BriefProcessState from a completed vote. Generation
 * is deterministic and synchronous: participation count = distinct voters,
 * position breakdown = sorted tally, concerns/suggestions empty (see
 * HANDOFF.md for the data-gap rationale).
 */
export function createBriefState(input: CreateBriefFromVoteInput): BriefProcessState {
  const content = generateBriefContent(input);
  return {
    type: "civic.brief",
    source_process_id: input.source_process_id,
    publication_status: "pending",
    generated_at: new Date().toISOString(),
    approved_at: null,
    published_at: null,
    content,
    delivered_to: [],
  };
}

function generateBriefContent(input: CreateBriefFromVoteInput): BriefContent {
  const entries = Object.entries(input.tally).sort((a, b) => b[1] - a[1]);
  const total = input.total_votes;
  const position_breakdown = entries.map(([option_id, count]) => ({
    option_id,
    option_label: option_id, // options are user-authored strings; id == label for MVP
    count,
    percentage: total > 0 ? Math.round((count / total) * 100) : 0,
  }));
  return {
    title: input.vote_title,
    participation_count: total,
    position_breakdown,
    // Seeded from civic.input. Admin can edit these in the review UI.
    comments: sanitizeList(input.comments ?? []),
    admin_notes: "",
  };
}

/** Emit the creation events. Called by the host hub once the brief row is persisted. */
export async function emitCreationEvents(
  ctx: BriefProcessContext,
  actor: string,
  state: BriefProcessState,
): Promise<void> {
  await emitBriefCreated(ctx, actor, state);
  await emitBriefAggregationCompleted(ctx, actor, state);
}

/**
 * Apply an admin edit to brief content. Rejects if the brief has already
 * been approved. Emits `civic.process.updated`.
 */
export async function editBrief(
  state: BriefProcessState,
  actor: string,
  patch: BriefContentPatch,
  ctx: BriefProcessContext,
): Promise<BriefActionOutcome> {
  if (!canEdit(state)) {
    throw new Error(
      `Brief cannot be edited: publication_status is "${state.publication_status}"`,
    );
  }

  const content = { ...state.content };
  if (patch.comments !== undefined) {
    content.comments = sanitizeList(patch.comments);
  }
  if (patch.admin_notes !== undefined) {
    content.admin_notes = patch.admin_notes;
  }
  state.content = content;

  await emitBriefUpdated(ctx, actor, state);

  return { state, result: { content } };
}

function sanitizeList(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (trimmed.length === 0) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

/**
 * Run the approval sequence. Performs steps in order; if any step fails,
 * halts and the caller is responsible for surfacing the error. Mutations
 * happen on the passed-in state object.
 *
 * Sequence (Civic Process Spec Phases 5 → 6):
 *   1. publication_status = approved, approved_at = now
 *   2. send email (HALT on failure — brief stays "approved", no events emit)
 *   3. record delivered_to
 *   4. emit outcome_recorded
 *   5. publication_status = published, published_at = now
 *   6. emit result_published (brief)
 *   7. finalize linked vote (which emits vote.result_published)
 */
export async function approveBrief(
  state: BriefProcessState,
  actor: string,
  ctx: BriefProcessContext,
  deps: {
    recipients: string[];
    hubLabel: string;
    publicBriefUrl: string;
    sendEmail: SendEmailFn;
    finalizeLinkedVote: FinalizeLinkedVoteFn;
  },
): Promise<BriefActionOutcome> {
  if (!canApprove(state)) {
    throw new Error(
      `Brief cannot be approved: publication_status is "${state.publication_status}"`,
    );
  }
  if (deps.recipients.length === 0) {
    throw new Error("Cannot approve brief: no email recipients configured (BOARD_RECIPIENT_EMAIL).");
  }

  // Step 1: transition to approved
  assertPublicationTransition(state.publication_status, "approved");
  state.publication_status = "approved";
  state.approved_at = new Date().toISOString();

  // Step 2: deliver email (halt on failure)
  const email = formatBriefEmail(state, {
    hubLabel: deps.hubLabel,
    publicUrl: deps.publicBriefUrl,
  });
  await deps.sendEmail({
    to: deps.recipients,
    subject: email.subject,
    html: email.html,
    text: email.text,
  });

  // Step 3: record recipients
  state.delivered_to = [...deps.recipients];

  // Step 4: outcome recorded (Phase 5)
  await emitBriefOutcomeRecorded(ctx, actor, state);

  // Step 5: transition to published
  assertPublicationTransition(state.publication_status, "published");
  state.publication_status = "published";
  state.published_at = new Date().toISOString();

  // Step 6: result published (Phase 6 — the brief itself)
  await emitBriefResultPublished(ctx, actor, state);

  // Step 7: finalize the linked vote — emits vote.result_published
  await deps.finalizeLinkedVote(state.source_process_id, actor);

  return {
    state,
    result: {
      publication_status: state.publication_status,
      approved_at: state.approved_at,
      published_at: state.published_at,
      delivered_to: state.delivered_to,
    },
  };
}

/**
 * Admin-facing read model (full brief detail).
 */
export function getAdminReadModel(
  state: BriefProcessState,
  processMeta: {
    id: string;
    title: string;
    createdAt: string;
    createdBy: string;
  },
): Record<string, unknown> {
  return {
    id: processMeta.id,
    type: "civic.brief",
    title: processMeta.title,
    source_process_id: state.source_process_id,
    publication_status: state.publication_status,
    generated_at: state.generated_at,
    approved_at: state.approved_at,
    published_at: state.published_at,
    content: state.content,
    delivered_to: state.delivered_to,
    created_at: processMeta.createdAt,
    created_by: processMeta.createdBy,
  };
}

/**
 * Public read model (published briefs only). Excludes fields irrelevant or
 * sensitive for public consumption (e.g. delivered_to email list).
 */
export function getPublicReadModel(
  state: BriefProcessState,
  processMeta: { id: string; title: string; createdAt: string },
): Record<string, unknown> | null {
  if (state.publication_status !== "published") return null;
  return {
    id: processMeta.id,
    type: "civic.brief",
    title: processMeta.title,
    source_process_id: state.source_process_id,
    participation_count: state.content.participation_count,
    position_breakdown: state.content.position_breakdown,
    comments: state.content.comments,
    admin_notes: state.content.admin_notes,
    generated_at: state.generated_at,
    published_at: state.published_at,
  };
}

/** Summary used by admin listing. */
export function getAdminSummary(
  state: BriefProcessState,
  processMeta: { id: string; title: string; createdAt: string },
): Record<string, unknown> {
  return {
    id: processMeta.id,
    type: "civic.brief",
    title: processMeta.title,
    source_process_id: state.source_process_id,
    publication_status: state.publication_status,
    participation_count: state.content.participation_count,
    generated_at: state.generated_at,
    approved_at: state.approved_at,
    published_at: state.published_at,
    created_at: processMeta.createdAt,
  };
}
