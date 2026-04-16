// civic.proposals module — proposal intake and endorsement service
//
// Manages the lifecycle of user-submitted civic proposals:
//   submitted → endorsed → converted (or archived)
//
// Proposals are raw, unstructured ideas. They become structured
// civic.vote processes only after admin review and curation.
//
// Storage: Postgres (proposals, proposal_supports tables).
//
// GUARDRAIL: This module MUST NOT import from civic.vote.
// The conversion to a vote is handled by the service/controller layer,
// which coordinates between this module and the vote module.

import { getDb } from "../../db/client.js";
import { generateId } from "../../utils/id.js";
import type {
  Proposal,
  ProposalSupport,
  ProposalStatus,
  CreateProposalInput,
  ProposalConfig,
} from "./models.js";
import {
  emitProposalSubmitted,
  emitProposalSupported,
  emitProposalEndorsed,
  type EmitEventFn,
} from "./events.js";

export type {
  Proposal,
  ProposalSupport,
  ProposalStatus,
  CreateProposalInput,
  ProposalConfig,
} from "./models.js";
export { DEFAULT_PROPOSAL_CONFIG } from "./models.js";

// --- Configuration ---------------------------------------------------------

let config: ProposalConfig = { proposal_support_threshold: 5 };

export function setProposalConfig(c: ProposalConfig): void {
  config = c;
}

export function getProposalConfig(): ProposalConfig {
  return { ...config };
}

// --- Row <-> model mapping -------------------------------------------------

interface ProposalRow {
  id: string;
  title: string;
  description: string | null;
  links: string[] | null;
  status: ProposalStatus;
  support_count: number;
  submitted_by: string | null;
  converted_to_process_id: string | null;
  created_at: string;
  updated_at: string;
}

function rowToProposal(row: ProposalRow): Proposal {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    optional_links: row.links ?? [],
    submitted_by: row.submitted_by ?? "",
    status: row.status,
    support_count: row.support_count,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// --- Proposal CRUD ---------------------------------------------------------

/**
 * Create a new proposal from user submission.
 */
export async function createProposal(
  input: CreateProposalInput,
  emit: EmitEventFn,
): Promise<Proposal> {
  if (!input.title || input.title.trim().length === 0) {
    throw new Error("Proposal title is required");
  }

  const id = generateId("prop");
  const links = (input.optional_links ?? []).filter((l) => l.trim().length > 0);

  const { data, error } = await getDb()
    .from("proposals")
    .insert({
      id,
      title: input.title.trim(),
      description: (input.description ?? "").trim(),
      links,
      status: "submitted" as ProposalStatus,
      support_count: 0,
      submitted_by: input.submitted_by,
    })
    .select()
    .single();

  if (error) {
    throw new Error(`Proposals: failed to create: ${error.message}`);
  }

  const proposal = rowToProposal(data as ProposalRow);

  console.log(
    `[proposal] created "${proposal.title}" (${id}) by ${proposal.submitted_by}`,
  );

  await emitProposalSubmitted(
    { proposal_id: id, emit },
    input.submitted_by,
    { title: proposal.title },
  );

  return proposal;
}

/**
 * Get a proposal by ID.
 */
export async function getProposal(id: string): Promise<Proposal | undefined> {
  const { data, error } = await getDb()
    .from("proposals")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Proposals: ${error.message}`);
  if (!data) return undefined;
  return rowToProposal(data as ProposalRow);
}

/**
 * List all proposals, optionally filtered by status. Newest first.
 */
export async function listProposals(
  statusFilter?: ProposalStatus,
): Promise<Proposal[]> {
  let query = getDb()
    .from("proposals")
    .select("*")
    .order("created_at", { ascending: false });

  if (statusFilter) {
    query = query.eq("status", statusFilter);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Proposals: ${error.message}`);
  return (data ?? []).map((r) => rowToProposal(r as ProposalRow));
}

/**
 * List proposals needing admin review (endorsed).
 * Most supported first, then most recent.
 */
export async function listEndorsedProposals(): Promise<Proposal[]> {
  const { data, error } = await getDb()
    .from("proposals")
    .select("*")
    .eq("status", "endorsed")
    .order("support_count", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Proposals: ${error.message}`);
  return (data ?? []).map((r) => rowToProposal(r as ProposalRow));
}

// --- Support / Endorsement -------------------------------------------------

/**
 * Add support from a user. If the endorsement threshold is reached,
 * transitions the proposal to "endorsed".
 *
 * Race-safe: composite primary key on proposal_supports rejects duplicate
 * (proposal_id, user_id) pairs atomically. support_count is reconciled
 * from the authoritative count in the supports table.
 */
export async function supportProposal(
  proposalId: string,
  userId: string,
  emit: EmitEventFn,
): Promise<Proposal> {
  const db = getDb();

  // Load current proposal and validate state.
  const proposal = await getProposal(proposalId);
  if (!proposal) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }
  if (proposal.status !== "submitted") {
    throw new Error(
      `Cannot support proposal: proposal is in "${proposal.status}" state. ` +
      `Only proposals in "submitted" state accept endorsements.`,
    );
  }

  // Insert support — composite PK catches duplicates atomically.
  const { error: supErr } = await db.from("proposal_supports").insert({
    proposal_id: proposalId,
    user_id: userId,
  });

  if (supErr) {
    if (supErr.code === "23505") {
      throw new Error("You have already supported this proposal");
    }
    throw new Error(`Proposals: ${supErr.message}`);
  }

  // Recount from the authoritative source (the supports table).
  const { count: supportCount, error: countErr } = await db
    .from("proposal_supports")
    .select("*", { count: "exact", head: true })
    .eq("proposal_id", proposalId);
  if (countErr) throw new Error(`Proposals: ${countErr.message}`);
  const newCount = supportCount ?? 0;

  const thresholdReached = newCount >= config.proposal_support_threshold;
  const newStatus: ProposalStatus = thresholdReached ? "endorsed" : "submitted";

  // Update the proposal row with the new count (and status, if crossing threshold).
  const { data: updated, error: updErr } = await db
    .from("proposals")
    .update({
      support_count: newCount,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposalId)
    .select()
    .single();
  if (updErr) throw new Error(`Proposals: ${updErr.message}`);

  const result = rowToProposal(updated as ProposalRow);

  await emitProposalSupported(
    { proposal_id: proposalId, emit },
    userId,
    {
      support_count: result.support_count,
      support_threshold: config.proposal_support_threshold,
    },
  );

  // Emit endorsed event exactly once — when we just crossed the threshold.
  if (thresholdReached && proposal.status === "submitted") {
    await emitProposalEndorsed(
      { proposal_id: proposalId, emit },
      userId,
      {
        support_count: result.support_count,
        support_threshold: config.proposal_support_threshold,
      },
    );
    console.log(
      `[proposal] "${result.title}" reached endorsement threshold ` +
      `(${result.support_count}/${config.proposal_support_threshold})`,
    );
  }

  return result;
}

/**
 * Check if a user has supported a proposal.
 */
export async function hasUserSupported(
  proposalId: string,
  userId: string,
): Promise<boolean> {
  const { count, error } = await getDb()
    .from("proposal_supports")
    .select("*", { count: "exact", head: true })
    .eq("proposal_id", proposalId)
    .eq("user_id", userId);
  if (error) throw new Error(`Proposals: ${error.message}`);
  return (count ?? 0) > 0;
}

/**
 * Get the support records for a proposal.
 */
export async function getProposalSupports(
  proposalId: string,
): Promise<ProposalSupport[]> {
  const { data, error } = await getDb()
    .from("proposal_supports")
    .select("*")
    .eq("proposal_id", proposalId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`Proposals: ${error.message}`);
  return (data ?? []).map((row, i) => ({
    id: `${row.proposal_id}-${i}`, // synthetic — DB uses composite PK
    proposal_id: row.proposal_id,
    user_id: row.user_id,
    created_at: row.created_at,
  }));
}

// --- Status transitions ----------------------------------------------------

/**
 * Mark a proposal as converted (after admin creates a vote from it).
 * Called by the service layer, not directly by API consumers.
 */
export async function markConverted(
  proposalId: string,
  voteProcessId?: string,
): Promise<void> {
  const proposal = await getProposal(proposalId);
  if (!proposal) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }
  if (proposal.status !== "endorsed") {
    throw new Error(
      `Cannot convert proposal: must be in "endorsed" state, currently "${proposal.status}"`,
    );
  }

  const { error } = await getDb()
    .from("proposals")
    .update({
      status: "converted" as ProposalStatus,
      converted_to_process_id: voteProcessId ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposalId);
  if (error) throw new Error(`Proposals: ${error.message}`);
}

/**
 * Archive a proposal (admin action — reject or shelve).
 */
export async function archiveProposal(proposalId: string): Promise<void> {
  const proposal = await getProposal(proposalId);
  if (!proposal) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }
  if (proposal.status === "converted") {
    throw new Error("Cannot archive a converted proposal");
  }

  const { error } = await getDb()
    .from("proposals")
    .update({
      status: "archived" as ProposalStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", proposalId);
  if (error) throw new Error(`Proposals: ${error.message}`);
}

// --- Read models -----------------------------------------------------------

/**
 * Get a UI-friendly read model for a proposal. If `actor` is provided,
 * includes whether that actor has supported.
 */
export async function getProposalReadModel(
  proposalId: string,
  actor?: string,
): Promise<Record<string, unknown> | undefined> {
  const proposal = await getProposal(proposalId);
  if (!proposal) return undefined;

  const hasSupported = actor ? await hasUserSupported(proposalId, actor) : null;

  return {
    id: proposal.id,
    title: proposal.title,
    description: proposal.description,
    optional_links: proposal.optional_links,
    submitted_by: proposal.submitted_by,
    status: proposal.status,
    support_count: proposal.support_count,
    support_threshold: config.proposal_support_threshold,
    has_supported: hasSupported,
    created_at: proposal.created_at,
    updated_at: proposal.updated_at,
  };
}

/**
 * Summary for list views. Takes an already-loaded Proposal.
 */
export function getProposalSummary(proposal: Proposal): Record<string, unknown> {
  return {
    id: proposal.id,
    title: proposal.title,
    description: proposal.description,
    submitted_by: proposal.submitted_by,
    status: proposal.status,
    support_count: proposal.support_count,
    support_threshold: config.proposal_support_threshold,
    created_at: proposal.created_at,
  };
}

// --- Dev/test utilities ----------------------------------------------------

/** Clear all proposals — dev/seed only. ON DELETE CASCADE removes supports. */
export async function clearProposals(): Promise<void> {
  const db = getDb();
  // Explicit delete of supports first (belt-and-suspenders; FK cascade would
  // handle it, but being explicit avoids any surprise if FK is modified).
  await db.from("proposal_supports").delete().neq("proposal_id", "");
  const { error } = await db.from("proposals").delete().neq("id", "");
  if (error) throw new Error(`Proposals: failed to clear: ${error.message}`);
}
