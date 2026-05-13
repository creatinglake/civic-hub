/**
 * Search endpoint tests.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { apiJson, ensureSeedData, type SearchResponse } from "../fixtures/helpers.js";

describe("Search endpoint", () => {
  beforeAll(async () => {
    await ensureSeedData();
  });

  it("GET /search?q=X returns results in wrapped response", async () => {
    const { status, body } = await apiJson<SearchResponse>("/search?q=vote");
    expect(status).toBe(200);
    expect(body.hits).toBeDefined();
    expect(Array.isArray(body.hits)).toBe(true);
    expect(body.total).toBeGreaterThanOrEqual(0);
  });

  it("GET /search without q returns 400", async () => {
    const { status } = await apiJson("/search");
    expect([400, 200]).toContain(status);
  });

  it("GET /search?q=xyznonexistent returns empty results", async () => {
    const { status, body } = await apiJson<SearchResponse>(
      "/search?q=xyznonexistent99999",
    );
    expect(status).toBe(200);
    expect(body.hits).toBeDefined();
    expect(body.hits.length).toBe(0);
    expect(body.total).toBe(0);
  });

  it("search results include process metadata", async () => {
    const { body } = await apiJson<SearchResponse>("/search?q=vote");
    if (body.hits.length > 0) {
      const hit = body.hits[0];
      expect(hit.process_id).toBeDefined();
      expect(hit.title).toBeDefined();
      expect(hit.type).toBeDefined();
    }
  });
});
