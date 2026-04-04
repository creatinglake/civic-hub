// Civic Process model based on Civic Process Spec v0.1
// A process represents a structured civic action (e.g., a vote, proposal, discussion)

export type ProcessStatus =
  | "draft"
  | "proposed"
  | "threshold_met"
  | "active"
  | "closed"
  | "finalized"
  // Legacy aliases — kept for backward compatibility with civic.proposal
  | "open";

export interface ProcessDefinition {
  type: string; // e.g., "civic.vote"
  version: string;
}

/** Structured content section for rich issue pages */
export interface ContentSection {
  title: string;
  body: string | string[]; // string for prose, string[] for bullet points
}

/** External reference link */
export interface ContentLink {
  label: string;
  url: string;
}

/** Community input configuration */
export interface CommunityInputConfig {
  prompt: string;
  label: string;
}

/** After-vote information block */
export interface AfterVoteInfo {
  body: string;
  recipients: string[];
}

/**
 * Structured content for rich issue pages.
 * Stored alongside the process, separate from process-specific state.
 * Optional — processes without content render the plain description only.
 */
export interface ProcessContent {
  core_question?: string;
  sections?: ContentSection[];
  key_tradeoff?: string;
  links?: ContentLink[];
  community_input?: CommunityInputConfig;
  after_vote?: AfterVoteInfo;
}

export interface Process {
  id: string;
  definition: ProcessDefinition;
  title: string;
  description: string;
  status: ProcessStatus;
  hubId: string;
  jurisdiction: string;
  createdBy: string; // userId or DID
  createdAt: string; // ISO 8601
  updatedAt: string;
  state: Record<string, unknown>; // process-specific state
  content?: ProcessContent; // structured issue content (optional)
}

export interface CreateProcessInput {
  definition: ProcessDefinition;
  title: string;
  description: string;
  hubId?: string;
  jurisdiction?: string;
  createdBy: string;
  state?: Record<string, unknown>;
  content?: ProcessContent;
}

export interface ProcessAction {
  type: string; // e.g., "process.vote", "process.close"
  actor: string; // userId or DID
  payload: Record<string, unknown>;
}
