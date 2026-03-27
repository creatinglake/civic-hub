// Civic Process model based on Civic Process Spec v0.1
// A process represents a structured civic action (e.g., a vote, proposal, discussion)

export type ProcessStatus = "draft" | "active" | "closed" | "archived";

export interface ProcessDefinition {
  type: string; // e.g., "civic.vote"
  version: string;
}

export interface Process {
  id: string;
  definition: ProcessDefinition;
  title: string;
  description: string;
  status: ProcessStatus;
  hubId: string;
  createdBy: string; // userId or DID
  createdAt: string; // ISO 8601
  updatedAt: string;
  state: Record<string, unknown>; // process-specific state
}

export interface CreateProcessInput {
  definition: ProcessDefinition;
  title: string;
  description: string;
  hubId?: string;
  createdBy: string;
  state?: Record<string, unknown>;
}

export interface ProcessAction {
  type: string; // e.g., "vote.submit", "vote.close"
  actor: string; // userId or DID
  payload: Record<string, unknown>;
}
