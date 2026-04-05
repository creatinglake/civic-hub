/**
 * API service — thin fetch wrapper for the Civic Hub backend.
 * All display data comes from read-layer endpoints.
 * Actions go through the internal process action endpoint.
 */

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "/api";

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }

  return res.json();
}

// --- Structured content types ---

export interface ContentSection {
  title: string;
  body: string | string[];
}

export interface ContentLink {
  label: string;
  url: string;
}

export interface CommunityInputConfig {
  prompt: string;
  label: string;
}

export interface AfterVoteInfo {
  body: string;
  recipients: string[];
}

export interface ProcessContent {
  core_question?: string;
  sections?: ContentSection[];
  key_tradeoff?: string;
  links?: ContentLink[];
  community_input?: CommunityInputConfig;
  after_vote?: AfterVoteInfo;
}

// --- Status types ---

export type VoteProcessStatus = "draft" | "proposed" | "threshold_met" | "active" | "closed" | "finalized";
export type ProposalProcessStatus = "open" | "closed";

// --- Read layer (UI-facing) ---

/** Shared base for all process summaries */
interface ProcessSummaryBase {
  id: string;
  type: string;
  title: string;
  status: string;
  created_at: string;
  created_by: string;
}

/** Vote summary (from GET /process list) */
export interface VoteSummary extends ProcessSummaryBase {
  type: "civic.vote";
  status: VoteProcessStatus;
  total_votes: number;
  support_count: number;
  support_threshold: number;
  closes_at: string | null;
}

/** Proposal summary (from GET /process list) */
export interface ProposalSummary extends ProcessSummaryBase {
  type: "civic.proposal";
  status: ProposalProcessStatus;
  support_count: number;
  support_threshold: number;
}

export type ProcessSummary = VoteSummary | ProposalSummary;

/** Vote detail state */
export interface VoteState {
  id: string;
  type: "civic.vote";
  title: string;
  description: string;
  status: VoteProcessStatus;
  options: string[];
  tally: Record<string, number> | null;
  total_votes: number | null;
  has_voted: boolean | null;
  has_supported: boolean | null;
  support_count: number;
  support_threshold: number;
  activation_mode: "direct" | "proposal_required";
  voting_opens_at: string | null;
  voting_closes_at: string | null;
  closes_at: string | null;
  result: { tally: Record<string, number>; total_votes: number; computed_at: string } | null;
  created_at: string;
  created_by: string;
  jurisdiction?: string;
  content?: ProcessContent;
}

/** Proposal detail state */
export interface ProposalState {
  id: string;
  type: "civic.proposal";
  title: string;
  description: string;
  status: ProposalProcessStatus;
  proposed_options: string[];
  support_count: number;
  support_threshold: number;
  has_supported: boolean | null;
  promoted_vote_id: string | null;
  created_at: string;
  created_by: string;
}

export type ProcessState = VoteState | ProposalState;

export function listProcesses(): Promise<ProcessSummary[]> {
  return request("GET", "/process");
}

export function getProcessState(id: string, actor?: string): Promise<ProcessState> {
  const params = actor ? `?actor=${encodeURIComponent(actor)}` : "";
  return request("GET", `/process/${id}/state${params}`);
}

// --- Actions (internal control surface) ---

export interface ActionResult {
  process: unknown;
  result: Record<string, unknown>;
}

export function submitVote(processId: string, actor: string, option: string): Promise<ActionResult> {
  return request("POST", `/process/${processId}/action`, {
    type: "process.vote",
    actor,
    payload: { option },
  });
}

export function endorseProposal(processId: string, actor: string): Promise<ActionResult> {
  return request("POST", `/process/${processId}/action`, {
    type: "proposal.support",
    actor,
    payload: {},
  });
}

export function supportVote(processId: string, actor: string): Promise<ActionResult> {
  return request("POST", `/process/${processId}/action`, {
    type: "process.support",
    actor,
    payload: {},
  });
}

export function unsupportVote(processId: string, actor: string): Promise<ActionResult> {
  return request("POST", `/process/${processId}/action`, {
    type: "process.unsupport",
    actor,
    payload: {},
  });
}

// --- Civic Proposals (separate from civic.vote process) ---

export type CivicProposalStatus = "submitted" | "endorsed" | "converted" | "archived";

/** Proposal summary (from GET /proposals list) */
export interface CivicProposalSummary {
  id: string;
  title: string;
  description: string;
  submitted_by: string;
  status: CivicProposalStatus;
  support_count: number;
  support_threshold: number;
  created_at: string;
}

/** Proposal detail (from GET /proposals/:id) */
export interface CivicProposalDetail {
  id: string;
  title: string;
  description: string;
  optional_links: string[];
  submitted_by: string;
  status: CivicProposalStatus;
  support_count: number;
  support_threshold: number;
  has_supported: boolean | null;
  created_at: string;
  updated_at: string;
}

/** Submit a new proposal */
export function submitProposal(
  title: string,
  submittedBy: string,
  description?: string,
  optionalLinks?: string[]
): Promise<CivicProposalDetail> {
  return request("POST", "/proposals", {
    title,
    submitted_by: submittedBy,
    description,
    optional_links: optionalLinks,
  });
}

/** List proposals (optional status filter) */
export function listCivicProposals(status?: CivicProposalStatus): Promise<CivicProposalSummary[]> {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  return request("GET", `/proposals${params}`);
}

/** Get proposal detail */
export function getCivicProposal(id: string, actor?: string): Promise<CivicProposalDetail> {
  const params = actor ? `?actor=${encodeURIComponent(actor)}` : "";
  return request("GET", `/proposals/${id}${params}`);
}

/** Support/endorse a proposal */
export function supportCivicProposal(
  proposalId: string,
  userId: string
): Promise<{ support_count: number; status: string }> {
  return request("POST", `/proposals/${proposalId}/support`, { user_id: userId });
}

// --- Admin: Proposal Review ---

/** List proposals for admin review */
export function adminListProposals(status?: string): Promise<CivicProposalSummary[]> {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  return request("GET", `/admin/proposals${params}`);
}

/** Get full proposal detail for admin review */
export function adminGetProposal(id: string): Promise<CivicProposalDetail> {
  return request("GET", `/admin/proposals/${id}`);
}

/** Convert an endorsed proposal to a civic.vote process */
export interface ConvertProposalInput {
  actor: string;
  title?: string;
  description?: string;
  question?: string;
  options?: string[];
  sections?: ContentSection[];
  key_tradeoff?: string;
  learn_more_links?: ContentLink[];
  community_input?: CommunityInputConfig;
  after_vote?: AfterVoteInfo;
  jurisdiction?: string;
  support_threshold?: number;
  voting_duration_ms?: number;
}

export interface ConvertProposalResult {
  message: string;
  proposal_id: string;
  vote_process: {
    id: string;
    title: string;
    status: string;
  };
}

export function convertProposal(
  proposalId: string,
  input: ConvertProposalInput
): Promise<ConvertProposalResult> {
  return request("POST", `/admin/proposals/${proposalId}/convert`, input);
}

/** Archive a proposal */
export function archiveProposal(proposalId: string): Promise<{ message: string }> {
  return request("POST", `/admin/proposals/${proposalId}/archive`);
}

// --- Community Input ---

export interface CommunityInput {
  id: string;
  process_id: string;
  author_id: string;
  body: string;
  submitted_at: string;
}

export function getInputs(processId: string): Promise<CommunityInput[]> {
  return request("GET", `/process/${processId}/input`);
}

export function submitInput(processId: string, authorId: string, body: string): Promise<CommunityInput> {
  return request("POST", `/process/${processId}/input`, {
    author_id: authorId,
    body,
  });
}

// --- Vote Log & Receipts ---

export interface VoteLogEntry {
  receipt_id: string;
  choice: string;
}

export interface VoteLogResponse {
  process_id: string;
  status: string;
  available: boolean;
  message?: string;
  total_votes?: number;
  log: VoteLogEntry[];
}

export interface ReceiptVerifyResponse {
  found: boolean;
  receipt_id?: string;
  choice?: string;
  message?: string;
}

export function getVoteLog(processId: string): Promise<VoteLogResponse> {
  return request("GET", `/votes/${processId}/log`);
}

export function verifyReceipt(processId: string, receiptId: string): Promise<ReceiptVerifyResponse> {
  return request("GET", `/votes/${processId}/verify?receipt=${encodeURIComponent(receiptId)}`);
}
