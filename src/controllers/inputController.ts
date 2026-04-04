// Input controller — handles HTTP request/response for community input endpoints

import { Request, Response } from "express";
import { submitInput, getInputsByProcess } from "../modules/civic.input/index.js";
import { getProcess } from "../services/processService.js";

export function handleSubmitInput(req: Request, res: Response): void {
  const processId = req.params.id as string;
  const { author_id, body } = req.body;

  if (!author_id || !body) {
    res.status(400).json({ error: "Missing required fields: author_id, body" });
    return;
  }

  const process = getProcess(processId);
  if (!process) {
    res.status(404).json({ error: "Process not found" });
    return;
  }

  try {
    const input = submitInput(processId, author_id, body);
    res.status(201).json(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: message });
  }
}

export function handleGetInputs(req: Request, res: Response): void {
  const processId = req.params.id as string;

  const process = getProcess(processId);
  if (!process) {
    res.status(404).json({ error: "Process not found" });
    return;
  }

  const inputs = getInputsByProcess(processId);
  res.json(inputs);
}
