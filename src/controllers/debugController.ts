// Debug controller — loads sample data for development testing.
// NOT for production use. All actions go through normal business logic.
//
// Two-layer safeguard against accidentally wiping live data:
//   1. CIVIC_ALLOW_SEED=true must be set in the env. Default deny.
//   2. SUPABASE_URL must NOT resolve to a hostname in
//      PROTECTED_SUPABASE_HOSTS. Even if (1) is satisfied (e.g. a stale
//      flag in a local .env), seeding against a known production
//      Supabase project is hard-coded as a 403. To seed a fresh dev
//      project, leave its hostname absent from the list.

import { Request, Response } from "express";
import {
  createProcess,
  executeAction,
  clearProcesses,
} from "../services/processService.js";
import { clearEvents, getEventCount } from "../events/eventStore.js";
import { emitEvent } from "../events/eventEmitter.js";
import { clearInputs, submitInput } from "../modules/civic.input/index.js";
import { clearProposals } from "../modules/civic.proposals/index.js";
import { clearAuth } from "../modules/civic.auth/index.js";
import { clearReceipts } from "../modules/civic.receipts/index.js";
import {
  FLOYD_FLOCK_CAMERA,
  FLOYD_GREEN_BOX,
  ALL_DELIBERATION_SEEDS,
  type SeedScenario,
  type DeliberationSeedScenario,
} from "../debug/seedData.js";
import { getDb } from "../db/client.js";

// Production Supabase hostnames that MUST NEVER be seeded against.
// Add a new entry whenever a new production project is provisioned.
// Do NOT add dev-only project hostnames here — being absent is the
// signal that seeding is permitted (subject to CIVIC_ALLOW_SEED).
const PROTECTED_SUPABASE_HOSTS: ReadonlyArray<string> = [
  "nfhyypwoporfggqcerli.supabase.co", // Floyd Civic Hub — production
];

function supabaseHostFromEnv(): string | null {
  const raw = process.env.SUPABASE_URL?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function runScenario(
  scenario: SeedScenario,
): Promise<Record<string, unknown>> {
  const process = await createProcess(scenario.process);

  for (const action of scenario.actions ?? []) {
    await executeAction(process.id, action);
  }

  if (scenario.inputs) {
    for (const input of scenario.inputs) {
      await submitInput(process.id, input.author_id, input.body, {
        hub_id: process.hubId,
        jurisdiction: process.jurisdiction,
        emit: emitEvent,
      });
    }
  }

  return {
    id: process.id,
    type: process.definition.type,
    title: process.title,
    status: process.status,
  };
}

/**
 * Seed a deliberation process by writing directly to the DB.
 * Bypasses the action dispatcher (and therefore the Polis API)
 * so we can create active/completed deliberations with fake data.
 */
async function seedDeliberation(
  scenario: DeliberationSeedScenario,
): Promise<Record<string, unknown>> {
  const { process: p, status } = scenario;
  const now = new Date().toISOString();

  const row = {
    id: p.id,
    type: p.definition.type,
    process_version: p.definition.version,
    title: p.title,
    description: p.description,
    jurisdiction: p.jurisdiction ?? "local",
    status,
    content: null,
    state: p.state as unknown as Record<string, unknown>,
    hub_id: "civic-hub-local",
    created_by: p.createdBy,
    source_proposal_id: null,
    starts_at: null,
    ends_at: null,
    created_at: now,
    updated_at: now,
  };

  const { error } = await getDb().from("processes").insert(row);
  if (error) {
    throw new Error(`Failed to seed deliberation "${p.title}": ${error.message}`);
  }

  // Emit a creation event so it shows in the feed
  await emitEvent({
    event_type: "civic.process.created",
    actor: p.createdBy,
    process_id: p.id,
    hub_id: "civic-hub-local",
    jurisdiction: p.jurisdiction ?? "local",
    data: {
      process: {
        type: p.definition.type,
        title: p.title,
      },
    },
  });

  return {
    id: p.id,
    type: p.definition.type,
    title: p.title,
    status,
  };
}

export async function handleSeed(
  _req: Request,
  res: Response,
): Promise<void> {
  // Layer 2 — hard-coded production host denylist. Checked FIRST so a
  // stale CIVIC_ALLOW_SEED=true in a local .env can never reach prod.
  const host = supabaseHostFromEnv();
  if (host && PROTECTED_SUPABASE_HOSTS.includes(host)) {
    console.warn(
      `[seed] BLOCKED: refusing to seed against protected production host "${host}". ` +
        `Use a separate dev Supabase project for seeding.`,
    );
    res.status(403).json({
      error:
        `Seeding is permanently disabled against the production Supabase host (${host}). ` +
        `Use a separate Supabase project for dev seeding — see civic-hub/src/controllers/debugController.ts.`,
    });
    return;
  }

  // Layer 1 — env flag. Default deny; opt-in per environment.
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

    // Deliberation / conversation seed data — bypasses Polis API
    for (const scenario of ALL_DELIBERATION_SEEDS) {
      createdProcesses.push(await seedDeliberation(scenario));
    }

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
