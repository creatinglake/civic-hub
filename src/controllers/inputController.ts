// Input controller — handles HTTP request/response for community input endpoints

import { Request, Response } from "express";
import { submitInput, getInputsByProcess } from "../modules/civic.input/index.js";
import { getProcess } from "../services/processService.js";
import { getAuthUser } from "../middleware/auth.js";

export async function handleSubmitInput(
  req: Request,
  res: Response,
): Promise<void> {
  const processId = req.params.id as string;
  const { body } = req.body;

  if (!body) {
    res.status(400).json({ error: "Missing required field: body" });
    return;
  }

  try {
    const process = await getProcess(processId);
    if (!process) {
      res.status(404).json({ error: "Process not found" });
      return;
    }

    const user = getAuthUser(res);
    const input = await submitInput(processId, user.id, body);
    res.status(201).json(input);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: message });
  }
}

export async function handleGetInputs(
  req: Request,
  res: Response,
): Promise<void> {
  const processId = req.params.id as string;
  try {
    const process = await getProcess(processId);
    if (!process) {
      res.status(404).json({ error: "Process not found" });
      return;
    }
    const inputs = await getInputsByProcess(processId);
    res.json(inputs);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
