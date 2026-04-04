// Proposal controller — handles HTTP request/response for proposal endpoints
//
// User-facing operations: submit, support, list, detail.
// Admin operations are in adminController.ts.

import { Request, Response } from "express";
import { emitEvent } from "../events/eventEmitter.js";
import {
  createProposal,
  getProposal,
  listProposals,
  supportProposal,
  getProposalReadModel,
  getProposalSummary,
  hasUserSupported,
} from "../modules/civic.proposals/index.js";

/**
 * POST /proposals — submit a new proposal
 */
export function handleSubmitProposal(req: Request, res: Response): void {
  const { title, description, optional_links, submitted_by } = req.body;

  if (!title || !submitted_by) {
    res.status(400).json({
      error: "Missing required fields: title, submitted_by",
    });
    return;
  }

  try {
    const proposal = createProposal(
      { title, description, optional_links, submitted_by },
      emitEvent
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
export function handleListProposals(req: Request, res: Response): void {
  const status = req.query.status as string | undefined;
  const validStatuses = ["submitted", "endorsed", "converted", "archived"];

  if (status && !validStatuses.includes(status)) {
    res.status(400).json({
      error: `Invalid status filter. Valid values: ${validStatuses.join(", ")}`,
    });
    return;
  }

  const proposals = listProposals(status as any);
  const summaries = proposals.map(getProposalSummary);
  res.json(summaries);
}

/**
 * GET /proposals/:id — get proposal detail
 */
export function handleGetProposal(req: Request, res: Response): void {
  const id = req.params.id as string;
  const actor = req.query.actor as string | undefined;

  const readModel = getProposalReadModel(id, actor);
  if (!readModel) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }

  res.json(readModel);
}

/**
 * POST /proposals/:id/support — endorse a proposal
 */
export function handleSupportProposal(req: Request, res: Response): void {
  const id = req.params.id as string;
  const { user_id } = req.body;

  if (!user_id) {
    res.status(400).json({ error: "Missing required field: user_id" });
    return;
  }

  try {
    const proposal = supportProposal(id, user_id, emitEvent);
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
