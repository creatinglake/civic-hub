// Admin controller — moderation surface for the civic.proposal idea board.
//
// A Proposal is an idea board (float an idea, gauge interest/discussion); it
// does NOT become a vote. The "gather support → official vote" mechanism lives
// in the civic.vote `proposal_required` lifecycle, not here. This controller
// lists proposals for admins and lets them archive (hide) ones that violate
// guidelines.

import { Request, Response } from "express";
import {
  listEndorsedProposals,
  listProposals,
  getProposalReadModel,
  getProposalSummary,
  archiveProposal,
} from "../modules/civic.proposals/index.js";

/**
 * GET /admin/proposals — list proposals for admin review.
 * Returns endorsed proposals first, then submitted.
 */
export async function handleAdminListProposals(
  req: Request,
  res: Response,
): Promise<void> {
  const statusFilter = req.query.status as string | undefined;

  try {
    let proposals;
    if (statusFilter) {
      proposals = await listProposals(statusFilter as any);
    } else {
      // Default: show endorsed first (needing review), then submitted.
      const endorsed = await listEndorsedProposals();
      const submitted = (await listProposals("submitted")).sort(
        (a, b) => b.support_count - a.support_count,
      );
      proposals = [...endorsed, ...submitted];
    }

    const summaries = proposals.map(getProposalSummary);
    res.json(summaries);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

/**
 * GET /admin/proposals/:id — get full proposal detail for admin review
 */
export async function handleAdminGetProposal(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id as string;
  try {
    const readModel = await getProposalReadModel(id);
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
 * POST /admin/proposals/:id/archive — archive a proposal (reject/shelve)
 */
export async function handleArchiveProposal(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id as string;

  try {
    await archiveProposal(id);
    res.json({ message: "Proposal archived", proposal_id: id });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("not found")) {
      res.status(404).json({ error: message });
    } else {
      res.status(400).json({ error: message });
    }
  }
}
