// Auto-seed on startup — ensures the Flock Camera issue is always present
// when the dev server starts. Uses the same seed logic as the debug endpoint.

import { createProcess, executeAction, getAllProcesses } from "../services/processService.js";
import { submitInput } from "../modules/civic.input/index.js";
import { FLOYD_FLOCK_CAMERA, type SeedScenario } from "./seedData.js";

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
    console.log(`[auto-seed] Skipped — ${existing.length} process(es) already loaded`);
    return;
  }

  console.log("[auto-seed] Seeding initial data...");
  runScenario(FLOYD_FLOCK_CAMERA);
  console.log("[auto-seed] Done\n");
}
