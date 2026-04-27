// Input controller — handles HTTP request/response for community input endpoints

import { Request, Response } from "express";
import {
  submitInput,
  getInputsByProcess,
  type CommunityInput,
} from "../modules/civic.input/index.js";
import { getProcess } from "../services/processService.js";
import { getAuthUser, isAdminEmail } from "../middleware/auth.js";
import { emitEvent } from "../events/eventEmitter.js";
import { getUserFromToken } from "../modules/civic.auth/index.js";

/**
 * Redact a hidden comment for non-admin viewers (Slice 11). The body
 * is replaced with an empty string and `moderation.reason` is dropped
 * — the reason is internal-audit only. Admins receive the row
 * unchanged.
 */
function redactForPublic(input: CommunityInput): CommunityInput {
  if (!input.moderation?.hidden) return input;
  return {
    ...input,
    body: "",
    moderation: {
      ...input.moderation,
      reason: null,
    },
  };
}

/** Best-effort admin detection — see eventController for the rationale. */
async function callerIsAdmin(req: Request): Promise<boolean> {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) return false;
  const token = auth.slice(7);
  if (!token) return false;
  try {
    const user = await getUserFromToken(token);
    if (!user) return false;
    return isAdminEmail(user.email);
  } catch {
    return false;
  }
}

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
    const input = await submitInput(processId, user.id, body, {
      hub_id: process.hubId,
      jurisdiction: process.jurisdiction,
      emit: emitEvent,
    });
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
    const isAdmin = await callerIsAdmin(req);
    res.json(isAdmin ? inputs : inputs.map(redactForPublic));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
