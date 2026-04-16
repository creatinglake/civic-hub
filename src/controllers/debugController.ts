// Debug controller — loads sample data for development testing.
// NOT for production use. All actions go through normal business logic.
// Gated behind CIVIC_ALLOW_SEED=true so an accidental call in production
// cannot wipe live data.

import { Request, Response } from "express";
import {
  createProcess,
  executeAction,
  clearProcesses,
} from "../services/processService.js";
import { clearEvents, getEventCount } from "../events/eventStore.js";
import { clearInputs, submitInput } from "../modules/civic.input/index.js";
import { clearProposals } from "../modules/civic.proposals/index.js";
import { clearAuth } from "../modules/civic.auth/index.js";
import { clearReceipts } from "../modules/civic.receipts/index.js";
import {
  FLOYD_FLOCK_CAMERA,
  FLOYD_GREEN_BOX,
  type SeedScenario,
} from "../debug/seedData.js";

async function runScenario(
  scenario: SeedScenario,
): Promise<Record<string, unknown>> {
  const process = await createProcess(scenario.process);

  for (const action of scenario.actions) {
    await executeAction(process.id, action);
  }

  if (scenario.inputs) {
    for (const input of scenario.inputs) {
      await submitInput(process.id, input.author_id, input.body);
    }
  }

  return {
    id: process.id,
    type: process.definition.type,
    title: process.title,
    status: process.status,
  };
}

export async function handleSeed(
  _req: Request,
  res: Response,
): Promise<void> {
  if (process.env.CIVIC_ALLOW_SEED !== "true") {
    res.status(403).json({
      error:
        "Seeding is disabled in this environment. Set CIVIC_ALLOW_SEED=true to enable.",
    });
    return;
  }

  try {
    console.log("\n[seed] Clearing existing data...");
    // Clear in dependency order: events first (they reference process IDs),
    // then processes + everything else.
    await clearEvents();
    await clearProcesses();
    await clearInputs();
    await clearProposals();
    await clearAuth();
    await clearReceipts();

    console.log("[seed] Seeding system...");

    const createdProcesses: Record<string, unknown>[] = [];

    // Floyd County Green Box — active vote
    createdProcesses.push(await runScenario(FLOYD_GREEN_BOX));

    // Floyd County Flock Camera — proposed vote
    createdProcesses.push(await runScenario(FLOYD_FLOCK_CAMERA));

    const eventCount = await getEventCount();

    console.log(
      `[seed] Created ${createdProcesses.length} processes, ${eventCount} events\n`,
    );

    res.json({
      message: "Seed data created",
      processes: createdProcesses,
      event_count: eventCount,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[seed] failed:", err);
    res.status(500).json({ error: message });
  }
}
