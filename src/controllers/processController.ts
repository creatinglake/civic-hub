// Process controller — handles HTTP request/response for process endpoints

import { Request, Response } from "express";
import {
  createProcess,
  getProcess,
  executeAction,
  listProcessSummaries,
  getProcessState,
} from "../services/processService.js";
import { getAuthUser } from "../middleware/auth.js";

export async function handleCreateProcess(
  req: Request,
  res: Response,
): Promise<void> {
  const { definition, title, description, jurisdiction, state, content } = req.body;

  if (!definition?.type || !title) {
    res.status(400).json({
      error: "Missing required fields: definition.type, title",
    });
    return;
  }

  try {
    // Actor comes from the authenticated admin session, not the request body.
    const admin = getAuthUser(res);
    const process = await createProcess({
      definition,
      title,
      description: description ?? "",
      createdBy: admin.id,
      jurisdiction,
      state,
      content,
    });

    res.status(201).json(process);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: message });
  }
}

export async function handleGetProcess(
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
    res.json(process);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

export async function handleProcessAction(
  req: Request,
  res: Response,
): Promise<void> {
  const { type, payload } = req.body;
  const id = req.params.id as string;

  if (!type) {
    res.status(400).json({ error: "Missing required field: type" });
    return;
  }

  try {
    // Actor is the authenticated user — never taken from the request body.
    const user = getAuthUser(res);
    const { process, result } = await executeAction(id, {
      type,
      actor: user.id,
      payload: payload ?? {},
    });

    res.json({ process, result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    if (message.includes("not found")) {
      res.status(404).json({ error: message });
    } else {
      res.status(400).json({ error: message });
    }
  }
}

// --- Read layer for UI consumption ---

export async function handleListProcesses(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    res.json(await listProcessSummaries());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

export async function handleGetProcessState(
  req: Request,
  res: Response,
): Promise<void> {
  const id = req.params.id as string;
  const actor = req.query.actor as string | undefined;
  try {
    const state = await getProcessState(id, actor);
    if (!state) {
      res.status(404).json({ error: "Process not found" });
      return;
    }
    res.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
