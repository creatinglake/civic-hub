// Event controller — handles HTTP request/response for event endpoints

import { Request, Response } from "express";
import { getAllEvents } from "../events/eventStore.js";

export function handleGetEvents(_req: Request, res: Response): void {
  const events = getAllEvents();
  res.json({ events, count: events.length });
}
