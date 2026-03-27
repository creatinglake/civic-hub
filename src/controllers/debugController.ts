// Debug controller — creates sample data for testing
// NOT for production use. All actions go through normal business logic.

import { Request, Response } from "express";
import { createProcess, executeAction, clearProcesses } from "../services/processService.js";
import { clearEvents, getEventCount } from "../events/eventStore.js";

// Seed scenarios — each describes a complete process lifecycle
const SEED_SCENARIOS = [
  {
    process: {
      definition: { type: "civic.vote", version: "0.1" },
      title: "Should we build a community garden?",
      description: "Advisory vote on creating a new community garden in Riverside Park.",
      createdBy: "user:alice",
      state: { options: ["yes", "no", "abstain"] },
    },
    votes: [
      { actor: "user:alice", option: "yes" },
      { actor: "user:bob", option: "yes" },
      { actor: "user:carol", option: "no" },
      { actor: "user:dave", option: "abstain" },
      { actor: "user:eve", option: "yes" },
    ],
    close: true, // closed process — shows completed lifecycle
  },
  {
    process: {
      definition: { type: "civic.vote", version: "0.1" },
      title: "Approve budget allocation for park improvements?",
      description: "Vote to allocate $50,000 from the community fund for playground equipment and trail repairs.",
      createdBy: "user:bob",
      state: { options: ["approve", "reject", "abstain"] },
    },
    votes: [
      { actor: "user:alice", option: "approve" },
      { actor: "user:carol", option: "approve" },
      { actor: "user:dave", option: "reject" },
    ],
    close: false, // open — voters can still participate
  },
  {
    process: {
      definition: { type: "civic.vote", version: "0.1" },
      title: "Change town hall meeting schedule?",
      description: "Should we move the monthly town hall from Tuesday evenings to Saturday mornings?",
      createdBy: "user:carol",
      state: { options: ["tuesday", "saturday", "no preference"] },
    },
    votes: [
      { actor: "user:alice", option: "saturday" },
      { actor: "user:bob", option: "tuesday" },
      { actor: "user:dave", option: "saturday" },
      { actor: "user:eve", option: "no preference" },
      { actor: "user:frank", option: "saturday" },
    ],
    close: false, // open — still accepting votes
  },
];

export function handleSeed(_req: Request, res: Response): void {
  console.log("\n[seed] Clearing existing data...");
  clearProcesses();
  clearEvents();

  console.log("[seed] Seeding system...");

  const createdProcesses: Record<string, unknown>[] = [];

  for (const scenario of SEED_SCENARIOS) {
    // Create process through normal logic
    const process = createProcess(scenario.process);

    // Submit votes through normal action pipeline
    for (const v of scenario.votes) {
      executeAction(process.id, {
        type: "vote.submit",
        actor: v.actor,
        payload: { option: v.option },
      });
    }

    // Optionally close the process
    if (scenario.close) {
      executeAction(process.id, {
        type: "vote.close",
        actor: scenario.process.createdBy,
        payload: {},
      });
    }

    createdProcesses.push({
      id: process.id,
      title: process.title,
      status: process.status,
      vote_count: scenario.votes.length,
    });
  }

  const eventCount = getEventCount();

  console.log(`[seed] Created ${createdProcesses.length} processes, ${eventCount} events\n`);

  res.json({
    message: "Seed data created",
    processes: createdProcesses,
    event_count: eventCount,
  });
}
