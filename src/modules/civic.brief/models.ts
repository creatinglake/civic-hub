// civic.brief module — type definitions
//
// A Civic Brief is a structured summary of a completed vote process,
// intended for delivery to decision-makers (e.g. Board of Supervisors)
// and public publication. Briefs are themselves civic processes — they
// live in the same process store as votes and proposals and follow the
// spec's lifecycle model (Phases 0, 4, 5, 6 per Civic Process Spec §5).
//
// This module is self-contained and portable across hubs. The host hub
// provides callbacks for event emission, email delivery, and finalizing
// the linked vote. The module itself has no knowledge of Express, the
// process registry, Supabase, or nodemailer.

export type BriefPublicationStatus = "pending" | "approved" | "published";

export interface BriefPositionBreakdown {
  option_id: string;
  option_label: string;
  count: number;
  percentage: number;
}

export interface BriefContent {
  title: string;
  participation_count: number;
  position_breakdown: BriefPositionBreakdown[];
  concerns: string[];
  suggestions: string[];
  admin_notes: string;
}

/**
 * Shape of Process.state for a civic.brief process.
 *
 * The process-level `status` field (draft | active | closed | finalized)
 * tracks the lifecycle state machine. The brief-specific
 * `publication_status` tracks the admin review sub-state:
 *
 *   pending   — auto-generated, awaiting admin review
 *   approved  — admin approved, email sent, not yet published publicly
 *   published — final: visible on public /brief/:id page, feed post emitted
 */
export interface BriefProcessState {
  type: "civic.brief";
  source_process_id: string;             // the vote this brief summarizes
  publication_status: BriefPublicationStatus;
  generated_at: string;                  // ISO 8601
  approved_at: string | null;
  published_at: string | null;
  content: BriefContent;
  delivered_to: string[];                // email recipients recorded on approval
}

/**
 * Event emission callback — injected by the host hub. Matches the shape
 * used by civic.vote/models.ts EmitEventFn, extended with the optional
 * action_url_path so briefs can point events at the public brief page.
 */
export interface EmitEventFn {
  (input: {
    event_type: string;
    actor: string;
    process_id: string;
    hub_id: string;
    jurisdiction: string;
    data: Record<string, unknown>;
    action_url_path?: string;
  }): Promise<unknown>;
}

/**
 * Email delivery callback — injected by the host hub. Returns normally on
 * success; throws on delivery failure. The module halts the approval flow
 * if this throws.
 */
export interface SendEmailFn {
  (message: {
    to: string[];
    subject: string;
    html: string;
    text: string;
  }): Promise<void>;
}

/**
 * Finalize-linked-vote callback — injected by the host hub. Called after
 * the brief transitions to "published". Signals the vote module to
 * finalize the underlying vote process and emit its result_published.
 * The hub wires this to call `finalizeVote` on the vote process.
 */
export interface FinalizeLinkedVoteFn {
  (voteProcessId: string, actor: string): Promise<void>;
}

export interface BriefProcessContext {
  process_id: string;
  hub_id: string;
  jurisdiction: string;
  emit: EmitEventFn;
}

/** Standard outcome returned by module actions. */
export interface BriefActionOutcome {
  state: BriefProcessState;
  result: Record<string, unknown>;
}

/** Input the hub passes when creating a brief from a closed vote. */
export interface CreateBriefFromVoteInput {
  source_process_id: string;
  vote_title: string;
  tally: Record<string, number>; // option → count
  total_votes: number;
}

/** Partial content update used by PATCH /admin/briefs/:id. */
export interface BriefContentPatch {
  concerns?: string[];
  suggestions?: string[];
  admin_notes?: string;
}
