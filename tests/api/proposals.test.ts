/**
 * Proposal endpoint tests.
 *
 * Tests the public proposal submission and listing flow.
 */

import { describe, it, expect, beforeAll } from "vitest";
import {
  apiJson,
  getResidentToken,
  getBasicToken,
  authHeaders,
} from "../fixtures/helpers.js";

describe("Proposal endpoints", () => {
  let residentToken: string;
  let basicToken: string;

  beforeAll(async () => {
    residentToken = await getResidentToken();
    basicToken = await getBasicToken();
  });

  it("GET /proposals returns a list", async () => {
    const { status, body } = await apiJson<unknown[]>("/proposals");
    expect(status).toBe(200);
    expect(Array.isArray(body)).toBe(true);
  });

  it("POST /proposals requires authentication", async () => {
    const { status } = await apiJson("/proposals", {
      method: "POST",
      body: JSON.stringify({
        title: "Test proposal",
        description: "Should require auth",
      }),
    });
    expect(status).toBe(401);
  });

  it("POST /proposals requires residency", async () => {
    const { status } = await apiJson("/proposals", {
      method: "POST",
      headers: authHeaders(basicToken),
      body: JSON.stringify({
        title: "Test proposal",
        description: "Should require residency",
      }),
    });
    expect(status).toBe(403);
  });

  it("resident can submit a proposal", async () => {
    const proposal = {
      title: `Test proposal ${Date.now()}`,
      description: "A test proposal for automated testing",
    };

    const { status, body } = await apiJson<{
      id: string;
      title: string;
    }>("/proposals", {
      method: "POST",
      headers: authHeaders(residentToken),
      body: JSON.stringify(proposal),
    });

    expect(status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.title).toBe(proposal.title);
  });

  it("GET /proposals/:id returns proposal detail", async () => {
    // Create a proposal first
    const { body: created } = await apiJson<{ id: string }>("/proposals", {
      method: "POST",
      headers: authHeaders(residentToken),
      body: JSON.stringify({
        title: `Detail test ${Date.now()}`,
        description: "For detail endpoint test",
      }),
    });

    const { status, body } = await apiJson<{ id: string; title: string }>(
      `/proposals/${created.id}`,
    );
    expect(status).toBe(200);
    expect(body.id).toBe(created.id);
  });
});
