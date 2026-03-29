/**
 * API service — thin fetch wrapper for the Civic Hub backend.
 * All display data comes from read-layer endpoints.
 * Actions go through the internal process action endpoint.
 */

const API_BASE = "http://localhost:3000";

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

// --- Read layer (UI-facing) ---

/** Shared base for all process summaries */
interface ProcessSummaryBase {
  id: string;
  type: string;
  title: string;
  status: "open" | "closed";
  created_at: string;
  created_by: string;
}

/** Vote summary (from GET /process list) */
export interface VoteSummary extends ProcessSummaryBase {
  type: "civic.vote";
  total_votes: number;
  closes_at: string | null;
}

/** Proposal summary (from GET /process list) */
export interface ProposalSummary extends ProcessSummaryBase {
  type: "civic.proposal";
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
  status: "open" | "closed";
  options: string[];
  tally: Record<string, number> | null;
  total_votes: number | null;
  has_voted: boolean | null;
  closes_at: string;
  created_at: string;
  created_by: string;
}

/** Proposal detail state */
export interface ProposalState {
  id: string;
  type: "civic.proposal";
  title: string;
  description: string;
  status: "open" | "closed";
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
    type: "vote.submit",
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
