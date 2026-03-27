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

export interface ProcessSummary {
  id: string;
  type: string;
  title: string;
  status: "open" | "closed";
  created_at: string;
  created_by: string;
}

export interface ProcessState {
  id: string;
  type: string;
  title: string;
  description: string;
  status: "open" | "closed";
  options: string[];
  tally: Record<string, number>;
  total_votes: number;
  created_at: string;
  created_by: string;
}

export function listProcesses(): Promise<ProcessSummary[]> {
  return request("GET", "/process");
}

export function getProcessState(id: string): Promise<ProcessState> {
  return request("GET", `/process/${id}/state`);
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
