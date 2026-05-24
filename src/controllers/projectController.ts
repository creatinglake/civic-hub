import { Request, Response } from "express";
import { emitEvent } from "../events/eventEmitter.js";
import { getAuthUser } from "../middleware/auth.js";
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
    res.json(summaries);
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
  const actor = req.query.actor as string | undefined;

  try {
    const readModel = await getProjectReadModel(id, actor);
    if (!readModel) {
      res.status(404).json({ error: "Project not found" });
      return;
    }
    res.json(readModel);
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
    res.json(comments);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
