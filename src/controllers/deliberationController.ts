import type { Request, Response } from "express";
import { getAuthUser, isAdminEmail } from "../middleware/auth.js";
import { getPolisAdapter } from "../processes/deliberationBoot.js";
import * as processService from "../services/processService.js";
import type { PolisDeliberationState } from "../shared/polis_deliberation/types.js";
import type { VoteDirection } from "../shared/polis_deliberation/adapter/types.js";
import {
  isSeedConversation,
  getMockClusters,
  getMockNextStatement,
  advanceMockStatement,
  addMockStatement,
} from "../debug/seedDeliberationMocks.js";
import { submitForReview } from "../modules/civic.review/index.js";

async function getConversationId(processId: string): Promise<string> {
  const process = await processService.getProcess(processId);
  if (!process) {
    throw new Error(`Process "${processId}" not found`);
  }
  if (process.status !== "active") {
    throw new Error("Deliberation is not active");
  }
  const state = process.state as unknown as PolisDeliberationState;
  if (!state.polis_conversation_id) {
    throw new Error("Deliberation has not been started");
  }
  return state.polis_conversation_id;
}

export async function vote(req: Request, res: Response): Promise<void> {
  try {
    const user = getAuthUser(res);
    const processId = req.params.processId as string;
    const { statement_id, vote: direction } = req.body;

    if (typeof statement_id !== "number" || !direction) {
      res.status(400).json({ error: "statement_id (number) and vote (agree|disagree|pass) are required" });
      return;
    }

    const validVotes: VoteDirection[] = ["agree", "disagree", "pass"];
    if (!validVotes.includes(direction)) {
      res.status(400).json({ error: "vote must be agree, disagree, or pass" });
      return;
    }

    const conversationId = await getConversationId(processId);

    // Seed conversations use mock data — no Polis API call
    if (isSeedConversation(conversationId)) {
      advanceMockStatement(conversationId, user.id);
      res.json({ ok: true });
      return;
    }

    const adapter = getPolisAdapter();
    await adapter.recordVote(conversationId, user.id, statement_id, direction);
    res.json({ ok: true });
  } catch (err: any) {
    handleError(res, err);
  }
}

export async function submitStatement(req: Request, res: Response): Promise<void> {
  try {
    const user = getAuthUser(res);
    const processId = req.params.processId as string;
    const { text } = req.body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const conversationId = await getConversationId(processId);

    // Seed conversations use mock data
    if (isSeedConversation(conversationId)) {
      const stmt = addMockStatement(conversationId, text.trim());
      res.status(201).json(stmt ?? { id: 0, text: text.trim() });
      return;
    }

    const adapter = getPolisAdapter();
    const result = await adapter.submitStatement(conversationId, user.id, text.trim());
    res.status(201).json(result);
  } catch (err: any) {
    handleError(res, err);
  }
}

export async function getNextStatement(req: Request, res: Response): Promise<void> {
  try {
    const user = getAuthUser(res);
    const processId = req.params.processId as string;

    const conversationId = await getConversationId(processId);

    // Seed conversations use mock data
    if (isSeedConversation(conversationId)) {
      const statement = getMockNextStatement(conversationId, user.id);
      res.json({ statement });
      return;
    }

    const adapter = getPolisAdapter();
    const statement = await adapter.getNextStatement(conversationId, user.id);
    res.json({ statement });
  } catch (err: any) {
    handleError(res, err);
  }
}

export async function getClusterState(req: Request, res: Response): Promise<void> {
  try {
    const processId = req.params.processId as string;
    const conversationId = await getConversationId(processId);

    // Seed conversations use mock data
    if (isSeedConversation(conversationId)) {
      const clusters = getMockClusters(conversationId);
      if (clusters) {
        res.json(clusters);
      } else {
        res.json({ participant_count: 0, statement_count: 0, math_tick: 0, groups: [], consensus: { agree: [], disagree: [] } });
      }
      return;
    }

    const adapter = getPolisAdapter();
    const clusters = await adapter.pullClusterState(conversationId);
    res.json(clusters);
  } catch (err: any) {
    handleError(res, err);
  }
}

export async function handleCreateDeliberation(req: Request, res: Response): Promise<void> {
  try {
    const user = getAuthUser(res);
    const { title, description, topic, framing, deadline, participation_threshold, seed_statements } = req.body;

    if (!topic || !framing) {
      res.status(400).json({ error: "topic and framing are required" });
      return;
    }

    const statePayload: Record<string, unknown> = {
      topic,
      framing,
      ...(deadline ? { deadline: new Date(deadline).toISOString() } : {}),
      ...(participation_threshold ? { participation_threshold: parseInt(participation_threshold, 10) } : {}),
      ...(seed_statements?.length ? { seed_statements } : {}),
    };

    if (isAdminEmail(user.email)) {
      const process = await processService.createProcess({
        definition: { type: "civic.polis_deliberation", version: "1.0" },
        title: title || topic,
        description: description || framing,
        createdBy: user.id,
        state: statePayload,
      });

      res.status(201).json(process);
    } else {
      const creatorName = user.display_name || user.email.split("@")[0];
      const result = await submitForReview({
        process_type: "civic.polis_deliberation",
        title: title || topic,
        description: description || framing,
        creator_id: user.id,
        creator_name: creatorName,
        creator_email: user.email,
        state: statePayload,
      });

      res.status(201).json({ review_id: result.review.id });
    }
  } catch (err: any) {
    handleError(res, err);
  }
}

export async function handleStartDeliberation(req: Request, res: Response): Promise<void> {
  try {
    const user = getAuthUser(res);
    const processId = req.params.processId as string;

    const result = await processService.executeAction(processId, {
      type: "start",
      actor: user.id,
      payload: {},
    });

    res.json(result);
  } catch (err: any) {
    handleError(res, err);
  }
}

export async function closeDeliberation(req: Request, res: Response): Promise<void> {
  try {
    const user = getAuthUser(res);
    const processId = req.params.processId as string;

    const result = await processService.executeAction(processId, {
      type: "close",
      actor: user.id,
      payload: {},
    });

    res.json(result);
  } catch (err: any) {
    handleError(res, err);
  }
}

export async function regenerateSummary(req: Request, res: Response): Promise<void> {
  try {
    const user = getAuthUser(res);
    const processId = req.params.processId as string;

    const result = await processService.executeAction(processId, {
      type: "regenerate_summary",
      actor: user.id,
      payload: {},
    });

    res.json(result);
  } catch (err: any) {
    handleError(res, err);
  }
}

export async function listDeliberations(_req: Request, res: Response): Promise<void> {
  try {
    const all = await processService.getAllProcesses();
    const deliberations = all.filter(
      (p) => p.definition.type === "civic.polis_deliberation",
    );
    const handler = (await import("../processes/registry.js")).getProcessHandler(
      "civic.polis_deliberation",
    );
    if (!handler) {
      res.json([]);
      return;
    }
    const summaries = deliberations.map((p) => handler.getSummary(p));
    res.json(summaries);
  } catch (err: any) {
    handleError(res, err);
  }
}

export async function getDeliberation(req: Request, res: Response): Promise<void> {
  try {
    const processId = req.params.processId as string;
    const process = await processService.getProcess(processId);
    if (!process || process.definition.type !== "civic.polis_deliberation") {
      res.status(404).json({ error: "Deliberation not found" });
      return;
    }
    const handler = (await import("../processes/registry.js")).getProcessHandler(
      "civic.polis_deliberation",
    );
    if (!handler) {
      res.status(404).json({ error: "Deliberation handler not registered" });
      return;
    }
    const actor = req.query.actor as string | undefined;
    res.json(handler.getReadModel(process, actor));
  } catch (err: any) {
    handleError(res, err);
  }
}

function handleError(res: Response, err: any): void {
  const msg = err.message ?? "Internal error";
  if (msg.includes("not found")) {
    res.status(404).json({ error: msg });
  } else if (msg.includes("not active") || msg.includes("not been started")) {
    res.status(409).json({ error: msg });
  } else {
    res.status(500).json({ error: msg });
  }
}
