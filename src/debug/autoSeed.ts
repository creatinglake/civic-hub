// Auto-seed on startup — ensures the Flock Camera issue is always present
// when the dev server starts. Uses the same seed logic as the debug endpoint.

import { createProcess, executeAction, getAllProcesses } from "../services/processService.js";
import { submitInput } from "../modules/civic.input/index.js";
import { FLOYD_FLOCK_CAMERA, FLOYD_GREEN_BOX, type SeedScenario } from "./seedData.js";

function runScenario(scenario: SeedScenario): void {
  const process = createProcess(scenario.process);

  for (const action of scenario.actions) {
    executeAction(process.id, action);
  }

  if (scenario.inputs) {
    for (const input of scenario.inputs) {
      submitInput(process.id, input.author_id, input.body);
    }
  }

  console.log(`[auto-seed] Loaded: "${process.title}" (${process.id}) — status: ${process.status}`);
}

export function seedOnStartup(): void {
  // Only seed if the store is empty (don't duplicate on hot-reload)
  const existing = getAllProcesses();
  if (existing.length > 0) {
    return;
  }

  console.log("[auto-seed] Seeding initial data...");
  runScenario(FLOYD_GREEN_BOX);
  runScenario(FLOYD_FLOCK_CAMERA);
  console.log("[auto-seed] Done\n");
}

/**
 * Express middleware — ensures seed data exists before handling any request.
 * On Vercel, each serverless instance has its own in-memory store.
 * This guarantees data is present regardless of cold-start timing.
 */
export function ensureSeeded(_req: unknown, _res: unknown, next: () => void): void {
  seedOnStartup();
  next();
}
