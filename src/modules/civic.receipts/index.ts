// civic.receipts module — anonymous vote receipt service
//
// Strict data separation:
//   vote_records       — receipt_id → { process_id, choice, created_at }
//                        NO user_id. EVER.
//   vote_participation — (user_id, process_id) → has_voted
//                        NO receipt_id. EVER.
//
// The separation is enforced at the database level: the two tables
// share no join key, and no foreign key links them. See schema migration 001.
//
// GUARDRAIL: This module MUST NOT store receipt_id alongside user_id in any
// table, cache, log, or returned payload.

import crypto from "crypto";
import { getDb } from "../../db/client.js";
import type { VoteRecord, UserParticipation } from "./models.js";

// --- Receipt generation ----------------------------------------------------

function generateReceiptId(): string {
  return crypto.randomUUID();
}

// --- Public API ------------------------------------------------------------

/**
 * Record a vote with an anonymous receipt.
 *
 * Order of operations is chosen to fail closed under DB errors:
 *   1. Insert participation first. The composite primary key (user_id,
 *      process_id) atomically rejects duplicate votes.
 *   2. Insert the vote record with a fresh UUID receipt.
 *   3. If step 2 fails, best-effort roll back step 1 so the user can retry.
 *
 * Worst case (both steps succeed on retry after partial failure): the user
 * loses a vote once. This is strictly better than the alternative ordering,
 * where a DB glitch could allow double-voting.
 */
export async function recordVote(
  processId: string,
  userId: string,
  choice: string,
): Promise<{ receipt_id: string }> {
  const db = getDb();

  // 1) Reserve participation. PK collision = already voted.
  const { error: partErr } = await db.from("vote_participation").insert({
    user_id: userId,
    process_id: processId,
    has_voted: true,
  });

  if (partErr) {
    if (partErr.code === "23505") {
      throw new Error("You have already voted on this process");
    }
    throw new Error(`Receipts: ${partErr.message}`);
  }

  // 2) Store the vote record — NO user_id.
  const receipt_id = generateReceiptId();
  const { error: voteErr } = await db.from("vote_records").insert({
    receipt_id,
    process_id: processId,
    choice,
  });

  if (voteErr) {
    // Best-effort rollback of participation so the user can retry.
    await db
      .from("vote_participation")
      .delete()
      .eq("user_id", userId)
      .eq("process_id", processId);
    throw new Error(`Receipts: ${voteErr.message}`);
  }

  return { receipt_id };
}

/**
 * Look up a single receipt by exact ID.
 * Returns { receipt_id, choice } if found, null if not.
 * Does NOT return timestamps or any identifying info.
 */
export async function verifyReceipt(
  receiptId: string,
  processId: string,
): Promise<{ receipt_id: string; choice: string } | null> {
  const { data, error } = await getDb()
    .from("vote_records")
    .select("receipt_id, choice, process_id")
    .eq("receipt_id", receiptId)
    .maybeSingle();

  if (error || !data || data.process_id !== processId) return null;

  return {
    receipt_id: data.receipt_id,
    choice: data.choice,
  };
}

/**
 * Get the public vote log for a process.
 * Returns receipt_id and choice ONLY — no timestamps, no order.
 * List is shuffled to prevent ordering-based inference.
 */
export async function getVoteLog(
  processId: string,
): Promise<{ receipt_id: string; choice: string }[]> {
  const { data, error } = await getDb()
    .from("vote_records")
    .select("receipt_id, choice")
    .eq("process_id", processId);

  if (error) throw new Error(`Receipts: ${error.message}`);

  const log = (data ?? []).map((r) => ({
    receipt_id: r.receipt_id,
    choice: r.choice,
  }));

  // Fisher-Yates shuffle to prevent ordering-based inference.
  for (let i = log.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [log[i], log[j]] = [log[j], log[i]];
  }

  return log;
}

/**
 * Check if a user has already voted on a process.
 * Uses vote_participation only — never touches vote_records.
 */
export async function hasUserVoted(
  userId: string,
  processId: string,
): Promise<boolean> {
  const { count, error } = await getDb()
    .from("vote_participation")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("process_id", processId);
  if (error) throw new Error(`Receipts: ${error.message}`);
  return (count ?? 0) > 0;
}

/** Clear all receipt data — dev/test reset only. */
export async function clearReceipts(): Promise<void> {
  const db = getDb();
  const a = await db.from("vote_records").delete().neq("receipt_id", "");
  if (a.error) throw new Error(`Receipts: ${a.error.message}`);
  const b = await db.from("vote_participation").delete().neq("user_id", "");
  if (b.error) throw new Error(`Receipts: ${b.error.message}`);
}
