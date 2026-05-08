// Input controller — handles HTTP request/response for community input endpoints

import { Request, Response } from "express";
import {
  submitInput,
  getInputsByProcess,
  type CommunityInput,
  type CommentPhase,
} from "../modules/civic.input/index.js";
import { getProcess } from "../services/processService.js";
import { getDb } from "../db/client.js";
import { getAuthUser, isAdminEmail } from "../middleware/auth.js";
import { emitEvent } from "../events/eventEmitter.js";
import { getUserFromToken } from "../modules/civic.auth/index.js";

const HUB_ID = "civic-hub-local";

async function proposalExists(id: string): Promise<boolean> {
  const { data } = await getDb()
    .from("proposals")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  return !!data;
}

async function getSourceProposalId(processId: string): Promise<string | null> {
  const { data } = await getDb()
    .from("processes")
    .select("source_proposal_id")
    .eq("id", processId)
    .maybeSingle();
  return (data as { source_proposal_id: string | null } | null)
    ?.source_proposal_id ?? null;
}

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
    let hubId: string;
    let jurisdiction: string;
    let phase: CommentPhase;

    if (process) {
      hubId = process.hubId;
      jurisdiction = process.jurisdiction;
      phase = "vote";
    } else if (await proposalExists(processId)) {
      hubId = HUB_ID;
      jurisdiction = "local";
      phase = "proposal";
    } else {
      res.status(404).json({ error: "Process not found" });
      return;
    }

    const user = getAuthUser(res);
    const input = await submitInput(processId, user.id, body, {
      hub_id: hubId,
      jurisdiction,
      emit: emitEvent,
    }, phase);
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
    if (!process && !(await proposalExists(processId))) {
      res.status(404).json({ error: "Process not found" });
      return;
    }

    let inputs = await getInputsByProcess(processId);

    // If this is a vote that was converted from a proposal, merge in
    // the proposal-phase comments so they carry forward.
    if (process) {
      const sourceProposalId = await getSourceProposalId(processId);
      if (sourceProposalId) {
        const proposalInputs = await getInputsByProcess(sourceProposalId);
        inputs = [...inputs, ...proposalInputs];
      }
    }

    const isAdmin = await callerIsAdmin(req);
    res.json(isAdmin ? inputs : inputs.map(redactForPublic));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
