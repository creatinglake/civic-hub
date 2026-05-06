import { Request, Response } from "express";
import {
  buildHubActor,
  getActorConfig,
  buildWebfinger,
  processToActivityPub,
  AP_CONTENT_TYPE,
  JRD_CONTENT_TYPE,
} from "../modules/civic.federation/index.js";
import { getProcess, createProcess } from "../services/processService.js";
import { getProcessHandler } from "../processes/registry.js";
import { generateId } from "../utils/id.js";

export function handleGetActor(_req: Request, res: Response): void {
  const config = getActorConfig();
  const actor = buildHubActor(config);
  res.type(AP_CONTENT_TYPE).json(actor);
}

export function handleWebfinger(req: Request, res: Response): void {
  const resource = req.query.resource as string | undefined;
  if (!resource) {
    res.status(400).json({ error: "Missing required query parameter: resource" });
    return;
  }

  const config = getActorConfig();
  const response = buildWebfinger(resource, config.baseUrl, config.username);
  if (!response) {
    res.status(404).json({ error: "Resource not found" });
    return;
  }

  res.type(JRD_CONTENT_TYPE).json(response);
}

export function handleInbox(req: Request, res: Response): void {
  console.log("[federation] Inbox received activity:", JSON.stringify(req.body).slice(0, 200));
  res.sendStatus(202);
}

export function handleOutbox(_req: Request, res: Response): void {
  const config = getActorConfig();
  res.type(AP_CONTENT_TYPE).json({
    "@context": "https://www.w3.org/ns/activitystreams",
    id: `${config.baseUrl}/outbox`,
    type: "OrderedCollection",
    totalItems: 0,
    orderedItems: [],
  });
}

export async function handleGetProcessAP(
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

    const handler = getProcessHandler(process.definition.type);
    const config = getActorConfig();
    const actorId = `${config.baseUrl}/actor`;

    let apObject;
    if (handler && "toActivityPub" in handler && typeof handler.toActivityPub === "function") {
      apObject = handler.toActivityPub(process, actorId, config.baseUrl);
    } else {
      apObject = processToActivityPub(process, actorId, config.baseUrl);
    }

    res.type(AP_CONTENT_TYPE).json(apObject);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

export async function handleCreateTestProcess(
  _req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = generateId("proc");
    const process = await createProcess({
      id,
      definition: { type: "civic.vote", version: "0.1" },
      title: "Community Park Bench Installation Program",
      description:
        "Should the Town of Athens install new park benches along Main Street and in the town square to improve walkability and create gathering spaces for residents?",
      createdBy: "user:civic-admin",
      state: {
        options: [
          "Yes — install benches along Main Street and the town square",
          "No — the current seating is sufficient",
          "Yes, but only in the town square",
        ],
      },
    });

    const config = getActorConfig();
    const apUrl = `${config.baseUrl}/process/${process.id}`;
    res.status(201).json({
      message: "Test process created",
      id: process.id,
      mastodon_search_url: apUrl,
      ap_json_url: `${apUrl}.json`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
