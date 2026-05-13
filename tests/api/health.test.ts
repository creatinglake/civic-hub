/**
 * Health + discovery endpoint tests.
 *
 * These are the simplest smoke tests — if these fail, nothing else will work.
 */

import { describe, it, expect } from "vitest";
import { apiJson } from "../fixtures/helpers.js";

describe("Health and Discovery", () => {
  it("GET /health returns ok status", async () => {
    const { status, body } = await apiJson<{ status: string }>("/health");
    expect(status).toBe(200);
    expect(body.status).toBe("ok");
  });

  it("GET / returns endpoint directory", async () => {
    const { status, body } = await apiJson<{
      name: string;
      version: string;
      endpoints: Record<string, string>;
    }>("/");
    expect(status).toBe(200);
    expect(body.name).toBe("Civic Hub");
    expect(body.endpoints).toBeDefined();
    expect(Object.keys(body.endpoints).length).toBeGreaterThan(0);
  });

  it("GET /.well-known/civic.json returns discovery manifest", async () => {
    const { status, body } = await apiJson<{
      hub: { id: string };
      spec: Record<string, string>;
      capabilities: string[];
    }>("/.well-known/civic.json");
    expect(status).toBe(200);
    expect(body.hub).toBeDefined();
    expect(body.hub.id).toBeDefined();
    expect(body.capabilities).toBeDefined();
    expect(Array.isArray(body.capabilities)).toBe(true);
  });
});
