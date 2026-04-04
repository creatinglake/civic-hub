// civic.receipts module — anonymous vote receipt service
//
// Strict data separation:
//   - voteRecords: receipt_id → { process_id, choice, created_at } — NO user_id
//   - participation: "user_id:process_id" → has_voted — NO receipt_id
//
// GUARDRAIL: This module MUST NOT store receipt_id alongside user_id.

import crypto from "crypto";
import type { VoteRecord, UserParticipation } from "./models.js";

// --- In-memory stores (DEV-ONLY) ---

/** Vote records keyed by receipt_id — contains NO user identity */
const voteRecords = new Map<string, VoteRecord>();

/** Vote records indexed by process_id for log retrieval */
const processvotes = new Map<string, VoteRecord[]>();

/** User participation keyed by "user_id:process_id" — contains NO receipt_id */
const participation = new Map<string, UserParticipation>();

// --- Receipt generation ---

function generateReceiptId(): string {
  return crypto.randomUUID();
}

// --- Public API ---

/**
 * Record a vote with anonymous receipt.
 * Returns the receipt_id for the voter to keep.
 * The receipt_id is NEVER stored with the user_id.
 */
export function recordVote(
  processId: string,
  userId: string,
  choice: string
): { receipt_id: string } {
  // Check if user already voted (participation table only)
  const participationKey = `${userId}:${processId}`;
  const existing = participation.get(participationKey);
  if (existing?.has_voted) {
    throw new Error("You have already voted on this process");
  }

  // Generate anonymous receipt
  const receipt_id = generateReceiptId();
  const now = new Date().toISOString();

  // Store vote record (NO user_id)
  const record: VoteRecord = {
    receipt_id,
    process_id: processId,
    choice,
    created_at: now,
  };
  voteRecords.set(receipt_id, record);

  // Index by process
  const processRecords = processvotes.get(processId) ?? [];
  processRecords.push(record);
  processvotes.set(processId, processRecords);

  // Mark participation (NO receipt_id)
  participation.set(participationKey, {
    user_id: userId,
    process_id: processId,
    has_voted: true,
  });

  return { receipt_id };
}

/**
 * Look up a single receipt by exact ID.
 * Returns the choice if found, null if not.
 * Does NOT return timestamps or any identifying info.
 */
export function verifyReceipt(
  receiptId: string,
  processId: string
): { receipt_id: string; choice: string } | null {
  const record = voteRecords.get(receiptId);
  if (!record || record.process_id !== processId) {
    return null;
  }
  return {
    receipt_id: record.receipt_id,
    choice: record.choice,
  };
}

/**
 * Get the public vote log for a process.
 * Returns receipt_id and choice ONLY — no timestamps, no order.
 * List is shuffled to prevent ordering-based inference.
 */
export function getVoteLog(
  processId: string
): { receipt_id: string; choice: string }[] {
  const records = processvotes.get(processId) ?? [];

  // Strip timestamps and return only public fields
  const log = records.map((r) => ({
    receipt_id: r.receipt_id,
    choice: r.choice,
  }));

  // Shuffle to prevent ordering-based inference
  for (let i = log.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [log[i], log[j]] = [log[j], log[i]];
  }

  return log;
}

/**
 * Check if a user has already voted on a process.
 * Uses participation table only — no receipt info.
 */
export function hasUserVoted(userId: string, processId: string): boolean {
  const key = `${userId}:${processId}`;
  return participation.get(key)?.has_voted ?? false;
}

/** Clear all receipt data (dev/test reset) */
export function clearReceipts(): void {
  voteRecords.clear();
  processvotes.clear();
  participation.clear();
}
