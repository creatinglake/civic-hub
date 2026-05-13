/**
 * Process endpoint tests.
 *
 * Tests the public read layer: listing processes, getting process state.
 * Process creation and actions require auth (tested in lifecycle.test.ts).
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  apiJson,
  ensureSeedData,
  type ProcessSummary,
} from "../fixtures/helpers.js";

describe("Process endpoints (public read layer)", () => {
  beforeAll(async () => {
    await ensureSeedData();
  });

  it("GET /process returns a list of processes", async () => {
    const { status, body } = await apiJson<ProcessSummary[]>("/process");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  it("each process summary has required fields", async () => {
    const { body } = await apiJson<ProcessSummary[]>("/process");
    for (const p of body) {
      expect(p.id).toBeDefined();
      expect(p.type).toBeDefined();
      expect(p.title).toBeDefined();
      expect(typeof p.title).toBe("string");
    }
  });

  it("GET /process/:id returns a single process", async () => {
    // Get a process ID from the list
    const { body: list } = await apiJson<ProcessSummary[]>("/process");
    const firstId = list[0].id;

    const { status, body } = await apiJson<{ id: string; title: string }>(
      `/process/${firstId}`,
    );
    expect(status).toBe(200);
    expect(body.id).toBe(firstId);
    expect(body.title).toBeDefined();
  });

  it("GET /process/:id returns 404 for non-existent process", async () => {
    const { status } = await apiJson("/process/proc_nonexistent_12345");
    expect(status).toBe(404);
  });

  it("GET /process/:id/state returns UI-friendly state", async () => {
    const { body: list } = await apiJson<ProcessSummary[]>("/process");
    // Find a vote process (has the most interesting state)
    const vote = list.find((p) => p.type === "civic.vote");
    if (!vote) {
      // Skip if no vote process in seed data
      return;
    }

    const { status, body } = await apiJson<{ id: string; type: string }>(
      `/process/${vote.id}/state`,
    );
    expect(status).toBe(200);
    expect(body.id).toBe(vote.id);
    expect(body.type).toBe("civic.vote");
  });
});
