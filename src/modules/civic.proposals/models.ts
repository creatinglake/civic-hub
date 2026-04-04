// civic.proposals module — type definitions
//
// Proposals are raw, unstructured civic ideas submitted by users.
// They are separate from civic.vote processes, which are curated and structured.
//
// GUARDRAIL: This module MUST NOT import from civic.vote or any vote-specific code.
// Proposals live in their own data store and lifecycle.

/** Proposal lifecycle states */
export type ProposalStatus = "submitted" | "endorsed" | "converted" | "archived";

/** A civic proposal — a user-submitted idea for community consideration */
export interface Proposal {
  id: string;
  title: string;
  description: string;
  optional_links: string[];
  submitted_by: string; // userId or DID
  status: ProposalStatus;
  support_count: number;
  created_at: string; // ISO 8601
  updated_at: string;
}

/** Support record — one per (proposal_id, user_id) */
export interface ProposalSupport {
  id: string;
  proposal_id: string;
  user_id: string;
  created_at: string;
}

/** Input for creating a new proposal */
export interface CreateProposalInput {
  title: string;
  description?: string;
  optional_links?: string[];
  submitted_by: string;
}

/** Configuration for the proposals module */
export interface ProposalConfig {
  /** Number of endorsements required to mark a proposal as "endorsed" */
  proposal_support_threshold: number;
}

/** Default configuration */
export const DEFAULT_PROPOSAL_CONFIG: ProposalConfig = {
  proposal_support_threshold: 5,
};
