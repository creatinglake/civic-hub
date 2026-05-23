import { Request, Response } from "express";
import { getAuthUser } from "../middleware/auth.js";
import { emitEvent } from "../events/eventEmitter.js";
import {
  createDraft,
  getDraft,
  listUserDrafts,
  updateDraft,
  appendConversation,
  saveReviewResult,
  applyDraftProposal,
  setDraftStatus,
} from "../modules/civic.proposal_drafts/index.js";
import {
  callAssistant,
  type HubConfig,
  type DraftState,
  type Phase,
  type Category,
} from "../modules/civic.proposal_assistant/index.js";
import { createProposal } from "../modules/civic.proposals/index.js";

const VALID_CATEGORIES = new Set(["issue", "idea", "project", "concern"]);
const VALID_PHASES = new Set(["brainstorm", "review", "free_form"]);

function getHubConfig(): HubConfig {
  return {
    hub_name: process.env.HUB_NAME ?? "Floyd Civic Hub",
    community_description:
      "residents of Floyd County, Virginia — a small rural community in the Blue Ridge Mountains",
  };
}

function draftState(draft: { title: string; description: string; sources: string; considerations: string }): DraftState {
  return {
    title: draft.title,
    description: draft.description,
    sources: draft.sources,
    considerations: draft.considerations,
  };
}

export async function handleCreateDraft(
  req: Request,
  res: Response,
): Promise<void> {
  const user = getAuthUser(res);
  const { category } = req.body;

  if (category && !VALID_CATEGORIES.has(category)) {
    res.status(400).json({ error: "Invalid category. Must be: issue, idea, or project" });
    return;
  }

  try {
    const draft = await createDraft({
      user_id: user.id,
      category: category as Category | undefined,
    });
    res.status(201).json(draft);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: message });
  }
}

export async function handleListDrafts(
  req: Request,
  res: Response,
): Promise<void> {
  const user = getAuthUser(res);

  try {
    const drafts = await listUserDrafts(user.id, "drafting");
    res.json(drafts);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

export async function handleGetDraft(
  req: Request,
  res: Response,
): Promise<void> {
  const user = getAuthUser(res);
  const id = req.params.id as string;

  try {
    const draft = await getDraft(id);
    if (!draft) {
      res.status(404).json({ error: "Draft not found" });
      return;
    }
    if (draft.user_id !== user.id) {
      res.status(403).json({ error: "Not authorized to view this draft" });
      return;
    }
    res.json(draft);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

export async function handleUpdateDraft(
  req: Request,
  res: Response,
): Promise<void> {
  const user = getAuthUser(res);
  const id = req.params.id as string;

  try {
    const draft = await getDraft(id);
    if (!draft) {
      res.status(404).json({ error: "Draft not found" });
      return;
    }
    if (draft.user_id !== user.id) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }
    if (draft.status !== "drafting") {
      res.status(400).json({ error: "Cannot edit a submitted draft" });
      return;
    }

    const { title, description, sources, considerations, category, skip_modified_flag } = req.body;

    if (category && !VALID_CATEGORIES.has(category)) {
      res.status(400).json({ error: "Invalid category" });
      return;
    }

    const updated = await updateDraft(id, {
      title,
      description,
      sources,
      considerations,
      category: category as Category | undefined,
      skip_modified_flag: skip_modified_flag === true,
    });
    res.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: message });
  }
}

export async function handleSendAssistantMessage(
  req: Request,
  res: Response,
): Promise<void> {
  const user = getAuthUser(res);
  const id = req.params.id as string;
  const { phase, user_message } = req.body;

  if (!user_message || typeof user_message !== "string") {
    res.status(400).json({ error: "user_message is required" });
    return;
  }
  if (!phase || !VALID_PHASES.has(phase)) {
    res.status(400).json({ error: "phase must be: brainstorm, review, or free_form" });
    return;
  }

  try {
    const draft = await getDraft(id);
    if (!draft) {
      res.status(404).json({ error: "Draft not found" });
      return;
    }
    if (draft.user_id !== user.id) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }
    if (draft.status !== "drafting") {
      res.status(400).json({ error: "Draft is not in drafting state" });
      return;
    }

    const category = draft.category ?? "idea";
    const hubConfig = getHubConfig();

    const response = await callAssistant({
      phase: phase as Phase,
      category: category as Category,
      draft_state: draftState(draft),
      conversation_history: draft.conversation_history,
      user_message,
      hub_config: hubConfig,
    });

    await appendConversation(id, user_message, response.message);

    if (response.draft_proposal) {
      await applyDraftProposal(
        id,
        response.draft_proposal.title,
        response.draft_proposal.description,
        response.draft_proposal.sources,
        response.draft_proposal.considerations,
      );
    }

    if (response.suggestions.length > 0) {
      await saveReviewResult(id, response.suggestions);
    }

    const updatedDraft = await getDraft(id);
    res.json({ response, draft: updatedDraft });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[proposal-assistant]", message);
    res.status(500).json({ error: message });
  }
}

export async function handleReviewDraft(
  req: Request,
  res: Response,
): Promise<void> {
  const user = getAuthUser(res);
  const id = req.params.id as string;

  try {
    const draft = await getDraft(id);
    if (!draft) {
      res.status(404).json({ error: "Draft not found" });
      return;
    }
    if (draft.user_id !== user.id) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }
    if (draft.status !== "drafting") {
      res.status(400).json({ error: "Draft is not in drafting state" });
      return;
    }

    const category = draft.category ?? "idea";
    const hubConfig = getHubConfig();

    const reviewMessage =
      "Please review my current draft against the Code of Conduct and Proposal Best Practices. " +
      "Return your feedback as structured suggestions.";

    const response = await callAssistant({
      phase: "review",
      category: category as Category,
      draft_state: draftState(draft),
      conversation_history: draft.conversation_history,
      user_message: reviewMessage,
      hub_config: hubConfig,
    });

    await appendConversation(id, reviewMessage, response.message);
    await saveReviewResult(id, response.suggestions);

    const updatedDraft = await getDraft(id);
    res.json({ response, draft: updatedDraft });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[proposal-review]", message);
    res.status(500).json({ error: message });
  }
}

export async function handleSubmitDraft(
  req: Request,
  res: Response,
): Promise<void> {
  const user = getAuthUser(res);
  const id = req.params.id as string;

  try {
    const draft = await getDraft(id);
    if (!draft) {
      res.status(404).json({ error: "Draft not found" });
      return;
    }
    if (draft.user_id !== user.id) {
      res.status(403).json({ error: "Not authorized" });
      return;
    }
    if (draft.status !== "drafting") {
      res.status(400).json({ error: "Draft already submitted" });
      return;
    }
    if (!draft.title.trim()) {
      res.status(400).json({ error: "Title is required" });
      return;
    }

    const hasHardBlocks = (draft.last_review_result ?? []).some(
      (s) => s.severity === "hard",
    );
    if (hasHardBlocks) {
      res.status(400).json({
        error: "Cannot submit: unresolved Code of Conduct concerns. Please review your draft and address all issues.",
      });
      return;
    }
    if (draft.draft_modified_since_review) {
      res.status(400).json({
        error: "Draft has been modified since last review. Please review again before submitting.",
      });
      return;
    }

    const optionalLinks = draft.sources
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    let fullDescription = draft.description.trim();
    if (draft.considerations.trim()) {
      fullDescription = fullDescription
        ? `${fullDescription}\n\nConsiderations:\n${draft.considerations.trim()}`
        : `Considerations:\n${draft.considerations.trim()}`;
    }

    const proposal = await createProposal(
      {
        title: draft.title.trim(),
        description: fullDescription || undefined,
        optional_links: optionalLinks.length > 0 ? optionalLinks : undefined,
        submitted_by: user.id,
        category: draft.category ?? undefined,
        assistant_helped: draft.assistant_helped,
      },
      emitEvent,
    );

    await setDraftStatus(id, "submitted");

    res.status(201).json({ proposal });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: message });
  }
}
