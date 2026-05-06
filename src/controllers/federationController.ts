import { Request, Response } from "express";
import {
  buildHubActor,
  getActorConfig,
  buildWebfinger,
  processToActivityPub,
  AP_CONTENT_TYPE,
  JRD_CONTENT_TYPE,
} from "../modules/civic.federation/index.js";
import { getProcess } from "../services/processService.js";
import { getProcessHandler } from "../processes/registry.js";

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
