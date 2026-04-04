// civic.proposals module — proposal intake and endorsement service
//
// Manages the lifecycle of user-submitted civic proposals:
//   submitted → endorsed → converted (or archived)
//
// Proposals are raw, unstructured ideas. They become structured
// civic.vote processes only after admin review and curation.
//
// GUARDRAIL: This module MUST NOT import from civic.vote.
// The conversion to a vote is handled by the service/controller layer,
// which coordinates between this module and the vote module.
//
// DEV-ONLY: In-memory storage — all data lost on restart.

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

// --- In-memory stores (DEV-ONLY) ---

const proposals = new Map<string, Proposal>();
const supportsByProposal = new Map<string, ProposalSupport[]>();

// --- Configuration ---

let config: ProposalConfig = { proposal_support_threshold: 5 };

export function setProposalConfig(c: ProposalConfig): void {
  config = c;
}

export function getProposalConfig(): ProposalConfig {
  return { ...config };
}

// --- Proposal CRUD ---

/**
 * Create a new proposal from user submission.
 */
export function createProposal(
  input: CreateProposalInput,
  emit: EmitEventFn
): Proposal {
  if (!input.title || input.title.trim().length === 0) {
    throw new Error("Proposal title is required");
  }

  const id = generateId("prop");
  const now = new Date().toISOString();

  const proposal: Proposal = {
    id,
    title: input.title.trim(),
    description: (input.description ?? "").trim(),
    optional_links: (input.optional_links ?? []).filter((l) => l.trim().length > 0),
    submitted_by: input.submitted_by,
    status: "submitted",
    support_count: 0,
    created_at: now,
    updated_at: now,
  };

  proposals.set(id, proposal);
  supportsByProposal.set(id, []);

  console.log(`[proposal] created "${proposal.title}" (${id}) by ${proposal.submitted_by}`);

  emitProposalSubmitted(
    { proposal_id: id, emit },
    input.submitted_by,
    { title: proposal.title }
  );

  return proposal;
}

/**
 * Get a proposal by ID.
 */
export function getProposal(id: string): Proposal | undefined {
  return proposals.get(id);
}

/**
 * List all proposals, optionally filtered by status.
 */
export function listProposals(statusFilter?: ProposalStatus): Proposal[] {
  const all = Array.from(proposals.values());
  if (statusFilter) {
    return all.filter((p) => p.status === statusFilter);
  }
  return all;
}

/**
 * List proposals that need admin review (endorsed status).
 * Sorted by most supported first, then most recent.
 */
export function listEndorsedProposals(): Proposal[] {
  return Array.from(proposals.values())
    .filter((p) => p.status === "endorsed")
    .sort((a, b) => {
      // Most supported first
      if (b.support_count !== a.support_count) {
        return b.support_count - a.support_count;
      }
      // Then most recent
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
}

// --- Support / Endorsement ---

/**
 * Add support from a user. If threshold is reached, transitions to "endorsed".
 * Returns the updated proposal.
 */
export function supportProposal(
  proposalId: string,
  userId: string,
  emit: EmitEventFn
): Proposal {
  const proposal = proposals.get(proposalId);
  if (!proposal) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }

  if (proposal.status !== "submitted") {
    throw new Error(
      `Cannot support proposal: proposal is in "${proposal.status}" state. ` +
      `Only proposals in "submitted" state accept endorsements.`
    );
  }

  // Check for duplicate support
  const supports = supportsByProposal.get(proposalId) ?? [];
  if (supports.some((s) => s.user_id === userId)) {
    throw new Error("You have already supported this proposal");
  }

  // Add support record
  const support: ProposalSupport = {
    id: generateId("sup"),
    proposal_id: proposalId,
    user_id: userId,
    created_at: new Date().toISOString(),
  };
  supports.push(support);
  supportsByProposal.set(proposalId, supports);

  proposal.support_count += 1;
  proposal.updated_at = new Date().toISOString();

  emitProposalSupported(
    { proposal_id: proposalId, emit },
    userId,
    {
      support_count: proposal.support_count,
      support_threshold: config.proposal_support_threshold,
    }
  );

  // Check if threshold reached
  if (proposal.support_count >= config.proposal_support_threshold) {
    proposal.status = "endorsed";

    emitProposalEndorsed(
      { proposal_id: proposalId, emit },
      userId,
      {
        support_count: proposal.support_count,
        support_threshold: config.proposal_support_threshold,
      }
    );

    console.log(
      `[proposal] "${proposal.title}" reached endorsement threshold ` +
      `(${proposal.support_count}/${config.proposal_support_threshold})`
    );
  }

  return proposal;
}

/**
 * Check if a user has supported a proposal.
 */
export function hasUserSupported(proposalId: string, userId: string): boolean {
  const supports = supportsByProposal.get(proposalId) ?? [];
  return supports.some((s) => s.user_id === userId);
}

/**
 * Get the support records for a proposal.
 */
export function getProposalSupports(proposalId: string): ProposalSupport[] {
  return supportsByProposal.get(proposalId) ?? [];
}

// --- Status transitions ---

/**
 * Mark a proposal as converted (after admin creates a vote from it).
 * Called by the service layer, not directly by API consumers.
 */
export function markConverted(proposalId: string): void {
  const proposal = proposals.get(proposalId);
  if (!proposal) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }
  if (proposal.status !== "endorsed") {
    throw new Error(
      `Cannot convert proposal: must be in "endorsed" state, currently "${proposal.status}"`
    );
  }
  proposal.status = "converted";
  proposal.updated_at = new Date().toISOString();
}

/**
 * Archive a proposal (admin action — reject or shelve).
 */
export function archiveProposal(proposalId: string): void {
  const proposal = proposals.get(proposalId);
  if (!proposal) {
    throw new Error(`Proposal not found: ${proposalId}`);
  }
  if (proposal.status === "converted") {
    throw new Error("Cannot archive a converted proposal");
  }
  proposal.status = "archived";
  proposal.updated_at = new Date().toISOString();
}

// --- Read model ---

/**
 * Get a UI-friendly read model for a proposal.
 */
export function getProposalReadModel(
  proposalId: string,
  actor?: string
): Record<string, unknown> | undefined {
  const proposal = proposals.get(proposalId);
  if (!proposal) return undefined;

  return {
    id: proposal.id,
    title: proposal.title,
    description: proposal.description,
    optional_links: proposal.optional_links,
    submitted_by: proposal.submitted_by,
    status: proposal.status,
    support_count: proposal.support_count,
    support_threshold: config.proposal_support_threshold,
    has_supported: actor ? hasUserSupported(proposalId, actor) : null,
    created_at: proposal.created_at,
    updated_at: proposal.updated_at,
  };
}

/**
 * Get a summary for list views.
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

// --- Dev/test utilities ---

/** Clear all proposals — used by debug/seed only */
export function clearProposals(): void {
  proposals.clear();
  supportsByProposal.clear();
}
