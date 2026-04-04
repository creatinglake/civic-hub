// civic.input module — community input service
//
// Allows free-text submissions tied to a process_id.
// Input is stored independently from votes and is NOT used
// in vote tallying or lifecycle transitions.
//
// GUARDRAIL: This module MUST NOT import from civic.vote or any lifecycle/results code.
// Community input is a parallel data stream — it does not affect process state.
// No AI or sentiment processing is implemented.

import type { CommunityInput } from "./models.js";

export type { CommunityInput } from "./models.js";

// DEV-ONLY: In-memory store — all data lost on restart.
// Replace with persistent storage before production.
const inputsByProcess = new Map<string, CommunityInput[]>();

let nextId = 1;

function generateInputId(): string {
  return `input_${(nextId++).toString().padStart(6, "0")}`;
}

/**
 * Submit community input for a process.
 */
export function submitInput(
  process_id: string,
  author_id: string,
  body: string
): CommunityInput {
  if (!body || body.trim().length === 0) {
    throw new Error("Input body cannot be empty");
  }

  const input: CommunityInput = {
    id: generateInputId(),
    process_id,
    author_id,
    body: body.trim(),
    submitted_at: new Date().toISOString(),
  };

  const existing = inputsByProcess.get(process_id) ?? [];
  existing.push(input);
  inputsByProcess.set(process_id, existing);

  return input;
}

/**
 * Get all community inputs for a process.
 */
export function getInputsByProcess(process_id: string): CommunityInput[] {
  return inputsByProcess.get(process_id) ?? [];
}

/**
 * Get the count of inputs for a process.
 */
export function getInputCount(process_id: string): number {
  return (inputsByProcess.get(process_id) ?? []).length;
}

/**
 * Clear all inputs — used by debug/test endpoints only.
 */
export function clearInputs(): void {
  inputsByProcess.clear();
  nextId = 1;
}
