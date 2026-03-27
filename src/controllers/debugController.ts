// Debug controller — creates sample data for testing
// NOT for production use

import { Request, Response } from "express";
import { createProcess, executeAction } from "../services/processService.js";
import { getEventsByProcessId } from "../events/eventStore.js";

export function handleSeed(_req: Request, res: Response): void {
  // Create a sample advisory vote
  const process = createProcess({
    definition: { type: "civic.vote", version: "0.1" },
    title: "Should we add a community garden?",
    description: "Advisory vote on creating a new community garden in the park.",
    createdBy: "user:alice",
    state: { options: ["yes", "no", "abstain"] },
  });

  // Submit several votes
  const voters = [
    { actor: "user:alice", option: "yes" },
    { actor: "user:bob", option: "yes" },
    { actor: "user:carol", option: "no" },
    { actor: "user:dave", option: "abstain" },
    { actor: "user:eve", option: "yes" },
  ];

  for (const v of voters) {
    executeAction(process.id, {
      type: "vote.submit",
      actor: v.actor,
      payload: { option: v.option },
    });
  }

  // Close the vote
  const { result } = executeAction(process.id, {
    type: "vote.close",
    actor: "user:alice",
    payload: {},
  });

  // Return only events for this specific process — not the global store
  const events = getEventsByProcessId(process.id);

  res.json({
    message: "Seed data created",
    process,
    events,
    event_count: events.length,
  });
}
