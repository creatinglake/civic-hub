// civic.input module — community input service
//
// Allows free-text submissions tied to a process_id.
// Input is stored independently from votes and is NOT used
// in vote tallying or lifecycle transitions.
//
// Storage: Postgres (community_inputs table).
//
// GUARDRAIL: This module MUST NOT import from civic.vote or any
// lifecycle/results code. Community input is a parallel data stream.

import { getDb } from "../../db/client.js";
import { generateId } from "../../utils/id.js";
import type { CommunityInput } from "./models.js";

export type { CommunityInput } from "./models.js";

interface InputRow {
  id: string;
  process_id: string;
  author_id: string | null;
  body: string;
  submitted_at: string;
}

function rowToInput(row: InputRow): CommunityInput {
  return {
    id: row.id,
    process_id: row.process_id,
    author_id: row.author_id ?? "",
    body: row.body,
    submitted_at: row.submitted_at,
  };
}

/**
 * Submit community input for a process.
 */
export async function submitInput(
  process_id: string,
  author_id: string,
  body: string,
): Promise<CommunityInput> {
  if (!body || body.trim().length === 0) {
    throw new Error("Input body cannot be empty");
  }

  const id = generateId("input");

  const { data, error } = await getDb()
    .from("community_inputs")
    .insert({
      id,
      process_id,
      author_id,
      body: body.trim(),
    })
    .select()
    .single();

  if (error) throw new Error(`Input: ${error.message}`);
  return rowToInput(data as InputRow);
}

/**
 * Get all community inputs for a process, oldest first.
 */
export async function getInputsByProcess(
  process_id: string,
): Promise<CommunityInput[]> {
  const { data, error } = await getDb()
    .from("community_inputs")
    .select("*")
    .eq("process_id", process_id)
    .order("submitted_at", { ascending: true });
  if (error) throw new Error(`Input: ${error.message}`);
  return (data ?? []).map((r) => rowToInput(r as InputRow));
}

/**
 * Count community inputs for a process.
 */
export async function getInputCount(process_id: string): Promise<number> {
  const { count, error } = await getDb()
    .from("community_inputs")
    .select("*", { count: "exact", head: true })
    .eq("process_id", process_id);
  if (error) throw new Error(`Input: ${error.message}`);
  return count ?? 0;
}

/** Clear all inputs — dev/seed only. */
export async function clearInputs(): Promise<void> {
  const { error } = await getDb()
    .from("community_inputs")
    .delete()
    .neq("id", "");
  if (error) throw new Error(`Input: failed to clear: ${error.message}`);
}
