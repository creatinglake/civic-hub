// Auto-seed on startup — ensures dev scenarios are loaded.
//
// Gated behind CIVIC_ALLOW_SEED=true. Set this in your local .env. Leave it
// unset in the Vercel Production environment so production data is never
// wiped by a seed run.
//
// Seeding is idempotent per serverless instance: if processes already exist
// in the in-memory store, we skip. On cold starts with a fresh instance,
// the guard is re-entered once.

import {
  createProcess,
  executeAction,
} from "../services/processService.js";
import { submitInput } from "../modules/civic.input/index.js";
import { getEventCount } from "../events/eventStore.js";
import { getDb } from "../db/client.js";
import {
  FLOYD_FLOCK_CAMERA,
  FLOYD_GREEN_BOX,
  type SeedScenario,
} from "./seedData.js";

function allowSeed(): boolean {
  return process.env.CIVIC_ALLOW_SEED === "true";
}

async function runScenario(scenario: SeedScenario): Promise<void> {
  const proc = await createProcess(scenario.process);

  for (const action of scenario.actions) {
    await executeAction(proc.id, action);
  }

  if (scenario.inputs) {
    for (const input of scenario.inputs) {
      await submitInput(proc.id, input.author_id, input.body);
    }
  }

  console.log(
    `[auto-seed] Loaded: "${proc.title}" (${proc.id}) — status: ${proc.status}`,
  );
}

// Memoize the seed run so concurrent requests don't trigger duplicate seeding.
let seedPromise: Promise<void> | null = null;

export async function seedOnStartup(): Promise<void> {
  if (!allowSeed()) return;
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    // Skip seeding if the processes table already has data.
    const { count, error } = await getDb()
      .from("processes")
      .select("*", { count: "exact", head: true });
    if (error) throw error;
    if ((count ?? 0) > 0) {
      const evCount = await getEventCount();
      console.log(
        `[auto-seed] Skipping — ${count} process(es) and ${evCount} event(s) already present. ` +
          `Use GET /debug/seed to reset and reseed.`,
      );
      return;
    }

    console.log("[auto-seed] Seeding initial data...");
    await runScenario(FLOYD_GREEN_BOX);
    await runScenario(FLOYD_FLOCK_CAMERA);
    console.log("[auto-seed] Done\n");
  })().catch((err) => {
    console.error("[auto-seed] failed:", err);
    // Reset so a later request can retry (e.g., transient DB error)
    seedPromise = null;
    throw err;
  });

  return seedPromise;
}

/**
 * Express middleware — ensures seed data exists before handling a request.
 * No-op when CIVIC_ALLOW_SEED is unset. Safe under concurrent requests.
 */
export async function ensureSeeded(
  _req: unknown,
  _res: unknown,
  next: (err?: unknown) => void,
): Promise<void> {
  try {
    await seedOnStartup();
    next();
  } catch (err) {
    next(err);
  }
}
