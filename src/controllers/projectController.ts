import { Request, Response } from "express";
import { emitEvent } from "../events/eventEmitter.js";
import { getAuthUser, resolveCallerId } from "../middleware/auth.js";
import {
  createProject,
  listProjects,
  getProjectReadModel,
  getProjectSummary,
  addProjectUpdate,
  setProjectSentiment,
  addProjectComment,
  listProjectComments,
} from "../modules/civic.projects/index.js";
import type { SentimentValue } from "../modules/civic.projects/models.js";
import { enrichCreator, enrichCreators } from "../services/creatorDisplay.js";

export async function handleCreateProject(
  req: Request,
  res: Response,
): Promise<void> {
  const { title, description, sources, assistant_helped } = req.body;

  if (!title) {
    res.status(400).json({ error: "Missing required field: title" });
    return;
  }

  try {
    const user = getAuthUser(res);
    const project = await createProject(
      { title, description, sources, user_id: user.id, assistant_helped },
      emitEvent,
    );
    res.status(201).json(project);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: message });
  }
}

export async function handleListProjects(
  req: Request,
  res: Response,
): Promise<void> {
  const status = req.query.status as string | undefined;
  const validStatuses = ["active", "archived"];

  if (status && !validStatuses.includes(status)) {
    res.status(400).json({
      error: `Invalid status filter. Valid values: ${validStatuses.join(", ")}`,
    });
    return;
  }

  try {
    const projects = await listProjects(status as any);
    const summaries = projects.map(getProjectSummary);
    // Resolve every creator in one query; attach name + admin flag and
    // redact the raw user_id from this public list.
    const enriched = await enrichCreators(summaries, { rawIdField: "user_id" });
    res.json(enriched);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

export async function handleGetProject(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id as string;
  // Caller identity comes from the session token, never from ?actor= (which
  // let anyone read another user's sentiment by passing their id). Anonymous
  // callers get the public read model with no per-actor fields.
  const callerId = await resolveCallerId(req);

  try {
    const readModel = await getProjectReadModel(id, callerId);
    if (!readModel) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    // Owner edit-affordance is a server-computed boolean, so the raw user_id
    // never leaves the API. enrichCreator redacts user_id (keepRawId omitted).
    const isOwner =
      !!callerId && (readModel as { user_id?: string }).user_id === callerId;
    const enriched = await enrichCreator(readModel, { rawIdField: "user_id" });
    enriched.is_owner = isOwner;
    res.json(enriched);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

export async function handleAddUpdate(
  req: Request,
  res: Response,
): Promise<void> {
  const projectId = req.params.id as string;
  const { content, media_urls } = req.body;

  if (!content || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "Update content is required" });
    return;
  }

  try {
    const user = getAuthUser(res);
    const update = await addProjectUpdate(
      projectId,
      user.id,
      content,
      media_urls ?? [],
      emitEvent,
    );
    res.status(201).json(update);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("not found")) {
      res.status(404).json({ error: message });
    } else if (message.includes("Only the project creator")) {
      res.status(403).json({ error: message });
    } else {
      res.status(400).json({ error: message });
    }
  }
}

export async function handleSetSentiment(
  req: Request,
  res: Response,
): Promise<void> {
  const projectId = req.params.id as string;
  const { sentiment } = req.body;

  const validSentiments = ["support", "oppose", "neutral"];
  if (!sentiment || !validSentiments.includes(sentiment)) {
    res.status(400).json({
      error: `sentiment must be one of: ${validSentiments.join(", ")}`,
    });
    return;
  }

  try {
    const user = getAuthUser(res);
    const result = await setProjectSentiment(
      projectId,
      user.id,
      sentiment as SentimentValue | "neutral",
      emitEvent,
    );
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("not found")) {
      res.status(404).json({ error: message });
    } else {
      res.status(400).json({ error: message });
    }
  }
}

export async function handleAddComment(
  req: Request,
  res: Response,
): Promise<void> {
  const projectId = req.params.id as string;
  const { content } = req.body;

  if (!content || typeof content !== "string" || !content.trim()) {
    res.status(400).json({ error: "Comment content is required" });
    return;
  }

  try {
    const user = getAuthUser(res);
    const comment = await addProjectComment(projectId, user.id, content, emitEvent);
    res.status(201).json(comment);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("not found")) {
      res.status(404).json({ error: message });
    } else {
      res.status(400).json({ error: message });
    }
  }
}

export async function handleListComments(
  req: Request,
  res: Response,
): Promise<void> {
  const projectId = req.params.id as string;

  try {
    const comments = await listProjectComments(projectId);
    // Attach creator name + admin flag (batched) and redact raw user_id.
    const enriched = await enrichCreators(
      comments as unknown as Record<string, unknown>[],
      { rawIdField: "user_id" },
    );
    res.json(enriched);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
