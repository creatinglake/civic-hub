// Admin controller — handles admin review and proposal-to-vote conversion.
//
// This controller coordinates between the civic.proposals module and
// the process service layer (which handles civic.vote creation).
// It is the only place where proposals and votes are linked.

import { Request, Response } from "express";
import { emitEvent } from "../events/eventEmitter.js";
import {
  listEndorsedProposals,
  listProposals,
  getProposal,
  getProposalReadModel,
  getProposalSummary,
  markConverted,
  archiveProposal,
} from "../modules/civic.proposals/index.js";
import { emitProposalConverted } from "../modules/civic.proposals/events.js";
import { createProcess } from "../services/processService.js";

/**
 * GET /admin/proposals — list proposals for admin review.
 * Returns endorsed proposals first, then submitted.
 */
export function handleAdminListProposals(req: Request, res: Response): void {
  const statusFilter = req.query.status as string | undefined;

  let proposals;
  if (statusFilter) {
    proposals = listProposals(statusFilter as any);
  } else {
    // Default: show endorsed first (needing review), then submitted
    const endorsed = listEndorsedProposals();
    const submitted = listProposals("submitted")
      .sort((a, b) => b.support_count - a.support_count);
    proposals = [...endorsed, ...submitted];
  }

  const summaries = proposals.map(getProposalSummary);
  res.json(summaries);
}

/**
 * GET /admin/proposals/:id — get full proposal detail for admin review
 */
export function handleAdminGetProposal(req: Request, res: Response): void {
  const id = req.params.id as string;
  const readModel = getProposalReadModel(id);

  if (!readModel) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }

  res.json(readModel);
}

/**
 * POST /admin/proposals/:id/convert — convert a proposal to a civic.vote process.
 *
 * Request body contains the curated vote definition:
 * {
 *   title: string (required),
 *   description: string,
 *   question: string,
 *   options: string[],
 *   sections: ContentSection[],
 *   key_tradeoff: string,
 *   learn_more_links: ContentLink[],
 *   community_input: CommunityInputConfig,
 *   after_vote: AfterVoteInfo,
 *   jurisdiction: string,
 *   actor: string (admin who is converting)
 * }
 */
export function handleConvertProposal(req: Request, res: Response): void {
  const proposalId = req.params.id as string;
  const {
    title,
    description,
    question,
    options,
    sections,
    key_tradeoff,
    learn_more_links,
    community_input,
    after_vote,
    jurisdiction,
    actor,
    support_threshold,
    voting_duration_ms,
  } = req.body;

  if (!actor) {
    res.status(400).json({ error: "Missing required field: actor" });
    return;
  }

  // Verify proposal exists and is in the right state
  const proposal = getProposal(proposalId);
  if (!proposal) {
    res.status(404).json({ error: "Proposal not found" });
    return;
  }

  if (proposal.status !== "endorsed") {
    res.status(400).json({
      error: `Cannot convert proposal: must be in "endorsed" state, currently "${proposal.status}"`,
    });
    return;
  }

  const voteTitle = title || proposal.title;
  const voteDescription = description || proposal.description;

  try {
    // Build structured content for the vote
    const content: Record<string, unknown> = {};
    if (question) content.core_question = question;
    if (sections) content.sections = sections;
    if (key_tradeoff) content.key_tradeoff = key_tradeoff;
    if (learn_more_links) content.links = learn_more_links;
    if (community_input) content.community_input = community_input;
    if (after_vote) content.after_vote = after_vote;

    // Create the civic.vote process via the process service
    const voteProcess = createProcess({
      definition: { type: "civic.vote", version: "0.1" },
      title: voteTitle,
      description: voteDescription,
      createdBy: actor,
      jurisdiction: jurisdiction ?? "local",
      state: {
        options: options ?? ["Yes", "No"],
        activation_mode: "proposal_required",
        support_threshold: support_threshold ?? 5,
        voting_duration_ms: voting_duration_ms ?? 7 * 24 * 60 * 60 * 1000,
        // Reference back to the original proposal
        source_proposal_id: proposalId,
      },
      ...(Object.keys(content).length > 0 ? { content } : {}),
    });

    // Mark proposal as converted
    markConverted(proposalId);

    // Emit conversion event
    emitProposalConverted(
      { proposal_id: proposalId, emit: emitEvent },
      actor,
      { vote_process_id: voteProcess.id, vote_title: voteProcess.title }
    );

    console.log(
      `[admin] Converted proposal "${proposal.title}" (${proposalId}) → ` +
      `vote "${voteProcess.title}" (${voteProcess.id})`
    );

    res.status(201).json({
      message: "Proposal converted to vote",
      proposal_id: proposalId,
      vote_process: {
        id: voteProcess.id,
        title: voteProcess.title,
        status: voteProcess.status,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: message });
  }
}

/**
 * POST /admin/proposals/:id/archive — archive a proposal (reject/shelve)
 */
export function handleArchiveProposal(req: Request, res: Response): void {
  const id = req.params.id as string;

  try {
    archiveProposal(id);
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
