// Debug controller — loads sample data for development testing.
// NOT for production use. All actions go through normal business logic.
// Server starts clean with zero processes — seed data must be loaded manually via GET /debug/seed.

import { Request, Response } from "express";
import { createProcess, executeAction, clearProcesses } from "../services/processService.js";
import { clearEvents, getEventCount } from "../events/eventStore.js";
import { clearInputs, submitInput } from "../modules/civic.input/index.js";
import { clearProposals } from "../modules/civic.proposals/index.js";
import { clearAuth } from "../modules/civic.auth/index.js";
import { clearReceipts } from "../modules/civic.receipts/index.js";
import {
  FLOYD_FLOCK_CAMERA,
  type SeedScenario,
} from "../debug/seedData.js";

function runScenario(scenario: SeedScenario): Record<string, unknown> {
  const process = createProcess(scenario.process);

  for (const action of scenario.actions) {
    executeAction(process.id, action);
  }

  if (scenario.inputs) {
    for (const input of scenario.inputs) {
      submitInput(process.id, input.author_id, input.body);
    }
  }

  return {
    id: process.id,
    type: process.definition.type,
    title: process.title,
    status: process.status,
  };
}

export function handleSeed(_req: Request, res: Response): void {
  console.log("\n[seed] Clearing existing data...");
  clearProcesses();
  clearEvents();
  clearInputs();
  clearProposals();
  clearAuth();
  clearReceipts();

  console.log("[seed] Seeding system...");

  const createdProcesses: Record<string, unknown>[] = [];

  // Floyd County Flock Camera — real pilot issue
  createdProcesses.push(runScenario(FLOYD_FLOCK_CAMERA));

  const eventCount = getEventCount();

  console.log(`[seed] Created ${createdProcesses.length} processes, ${eventCount} events\n`);

  res.json({
    message: "Seed data created",
    processes: createdProcesses,
    event_count: eventCount,
  });
}
