// Process controller — handles HTTP request/response for process endpoints

import { Request, Response } from "express";
import {
  createProcess,
  getProcess,
  executeAction,
  listProcessSummaries,
  getProcessState,
} from "../services/processService.js";

export function handleCreateProcess(req: Request, res: Response): void {
  const { definition, title, description, createdBy, state } = req.body;

  if (!definition?.type || !title || !createdBy) {
    res.status(400).json({
      error: "Missing required fields: definition.type, title, createdBy",
    });
    return;
  }

  const process = createProcess({
    definition,
    title,
    description: description ?? "",
    createdBy,
    state,
  });

  res.status(201).json(process);
}

export function handleGetProcess(req: Request, res: Response): void {
  const id = req.params.id as string;
  const process = getProcess(id);

  if (!process) {
    res.status(404).json({ error: "Process not found" });
    return;
  }

  res.json(process);
}

export function handleProcessAction(req: Request, res: Response): void {
  const { type, actor, payload } = req.body;
  const id = req.params.id as string;

  if (!type || !actor) {
    res.status(400).json({ error: "Missing required fields: type, actor" });
    return;
  }

  try {
    const { process, result } = executeAction(id, {
      type,
      actor,
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

export function handleListProcesses(_req: Request, res: Response): void {
  res.json(listProcessSummaries());
}

export function handleGetProcessState(req: Request, res: Response): void {
  const id = req.params.id as string;
  const state = getProcessState(id);

  if (!state) {
    res.status(404).json({ error: "Process not found" });
    return;
  }

  res.json(state);
}
