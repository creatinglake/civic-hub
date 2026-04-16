// Proposal controller — handles HTTP request/response for proposal endpoints
//
// User-facing operations: submit, support, list, detail.
// Admin operations are in adminController.ts.

import { Request, Response } from "express";
import { emitEvent } from "../events/eventEmitter.js";
import {
  createProposal,
  listProposals,
  supportProposal,
  getProposalReadModel,
  getProposalSummary,
} from "../modules/civic.proposals/index.js";
import { getAuthUser } from "../middleware/auth.js";

/**
 * POST /proposals — submit a new proposal
 */
export async function handleSubmitProposal(
  req: Request,
  res: Response,
): Promise<void> {
  const { title, description, optional_links } = req.body;

  if (!title) {
    res.status(400).json({ error: "Missing required field: title" });
    return;
  }

  try {
    const user = getAuthUser(res);
    const proposal = await createProposal(
      { title, description, optional_links, submitted_by: user.id },
      emitEvent,
    );
    res.status(201).json(proposal);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: message });
  }
}

/**
 * GET /proposals — list all proposals (optionally filtered by status)
 */
export async function handleListProposals(
  req: Request,
  res: Response,
): Promise<void> {
  const status = req.query.status as string | undefined;
  const validStatuses = ["submitted", "endorsed", "converted", "archived"];

  if (status && !validStatuses.includes(status)) {
    res.status(400).json({
      error: `Invalid status filter. Valid values: ${validStatuses.join(", ")}`,
    });
    return;
  }

  try {
    const proposals = await listProposals(status as any);
    const summaries = proposals.map(getProposalSummary);
    res.json(summaries);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

/**
 * GET /proposals/:id — get proposal detail
 */
export async function handleGetProposal(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id as string;
  const actor = req.query.actor as string | undefined;

  try {
    const readModel = await getProposalReadModel(id, actor);
    if (!readModel) {
      res.status(404).json({ error: "Proposal not found" });
      return;
    }
    res.json(readModel);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

/**
 * POST /proposals/:id/support — endorse a proposal
 */
export async function handleSupportProposal(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id as string;

  try {
    const user = getAuthUser(res);
    const proposal = await supportProposal(id, user.id, emitEvent);
    res.json({
      support_count: proposal.support_count,
      status: proposal.status,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("not found")) {
      res.status(404).json({ error: message });
    } else {
      res.status(400).json({ error: message });
    }
  }
}
