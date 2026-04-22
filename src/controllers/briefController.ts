// Brief controller — public read endpoint for published Civic Briefs.
//
// Only briefs in publication_status = "published" are returned. Pending
// and approved (delivered-but-not-yet-public) briefs return 404 so they
// stay invisible to the public until admin publishes.

import { Request, Response } from "express";
import { getProcess } from "../services/processService.js";
import {
  getPublicReadModel,
  type BriefProcessState,
} from "../modules/civic.brief/index.js";

export async function handleGetBrief(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = req.params.id as string;
    const process = await getProcess(id);
    if (!process || process.definition.type !== "civic.brief") {
      res.status(404).json({ error: "Brief not found" });
      return;
    }
    const state = process.state as unknown as BriefProcessState;
    const model = getPublicReadModel(state, {
      id: process.id,
      title: process.title,
      createdAt: process.createdAt,
    });
    if (!model) {
      // Pending or approved-but-not-published — invisible to the public.
      res.status(404).json({ error: "Brief not found" });
      return;
    }
    res.json(model);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
