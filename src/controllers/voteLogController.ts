// Vote log controller — public vote audit log and receipt verification.
//
// Privacy rules:
//   - Vote log is ONLY visible after the vote is closed or finalized
//   - No timestamps exposed publicly
//   - Log is shuffled (no ordering inference)
//   - Receipt lookup is exact match only

import { Request, Response } from "express";
import { getVoteLog, verifyReceipt } from "../modules/civic.receipts/index.js";
import { getProcess } from "../services/processService.js";

/**
 * GET /votes/:id/log
 * Returns the public vote log for a process.
 * Only available after voting is closed or finalized.
 */
export async function handleGetVoteLog(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id as string;

  try {
    const process = await getProcess(id);
    if (!process) {
      res.status(404).json({ error: "Process not found" });
      return;
    }

    if (process.definition.type !== "civic.vote") {
      res.status(400).json({ error: "Not a vote process" });
      return;
    }

    // Vote log is only visible after vote is closed
    const status = process.status;
    if (status !== "closed" && status !== "finalized") {
      res.json({
        process_id: id,
        status,
        available: false,
        message: "Vote log will be available after voting ends",
        log: [],
      });
      return;
    }

    const log = await getVoteLog(id);

    res.json({
      process_id: id,
      status,
      available: true,
      total_votes: log.length,
      log,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

/**
 * GET /votes/:id/verify?receipt=<receipt_id>
 * Verify a specific receipt against a process.
 * Exact match only — no partial or fuzzy matching.
 */
export async function handleVerifyReceipt(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id as string;
  const receiptId = req.query.receipt as string;

  if (!receiptId) {
    res.status(400).json({ error: "receipt query parameter is required" });
    return;
  }

  try {
    const process = await getProcess(id);
    if (!process) {
      res.status(404).json({ error: "Process not found" });
      return;
    }

    if (process.definition.type !== "civic.vote") {
      res.status(400).json({ error: "Not a vote process" });
      return;
    }

    // Verification only available after vote is closed
    const status = process.status;
    if (status !== "closed" && status !== "finalized") {
      res.json({
        found: false,
        message: "Receipt verification will be available after voting ends",
      });
      return;
    }

    const result = await verifyReceipt(receiptId, id);

    if (result) {
      res.json({
        found: true,
        receipt_id: result.receipt_id,
        choice: result.choice,
      });
    } else {
      res.json({
        found: false,
        message: "Receipt not found. Check your receipt and try again.",
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
