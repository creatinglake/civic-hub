import { describe, it, expect } from "vitest";
import { isPastDeadline } from "../../src/utils/deadline.js";

describe("isPastDeadline", () => {
  const NOW = Date.parse("2026-06-26T12:00:00.000Z");

  it("returns true for a well-formed timestamp in the past", () => {
    expect(isPastDeadline("2026-06-26T11:59:59.000Z", NOW)).toBe(true);
    expect(isPastDeadline("2020-01-01T00:00:00.000Z", NOW)).toBe(true);
  });

  it("returns false for a well-formed timestamp in the future", () => {
    expect(isPastDeadline("2026-06-26T12:00:01.000Z", NOW)).toBe(false);
    expect(isPastDeadline("2030-01-01T00:00:00.000Z", NOW)).toBe(false);
  });

  it("returns false at the exact deadline (strictly past only)", () => {
    expect(isPastDeadline("2026-06-26T12:00:00.000Z", NOW)).toBe(false);
  });

  it("fails safe (false) for null / undefined / empty — no deadline set", () => {
    expect(isPastDeadline(null, NOW)).toBe(false);
    expect(isPastDeadline(undefined, NOW)).toBe(false);
    expect(isPastDeadline("", NOW)).toBe(false);
  });

  it("fails safe (false) for a malformed timestamp instead of silently closing/never-closing", () => {
    // The defect class this guards: `new Date("not-a-date")` is an Invalid Date
    // and every comparison against it is silently false. Date.parse → NaN here,
    // and Number.isFinite(NaN) is false, so a bad value can't be treated as past.
    expect(isPastDeadline("not-a-date", NOW)).toBe(false);
    expect(isPastDeadline("2026-13-99T99:99:99Z", NOW)).toBe(false);
    expect(isPastDeadline("garbage", NOW)).toBe(false);
  });

  it("accepts a non-ISO but parseable date string", () => {
    // Date.parse is lenient; a recognizable past date still counts as past.
    expect(isPastDeadline("January 1, 2020", NOW)).toBe(true);
  });

  it("defaults `now` to the current time when omitted", () => {
    expect(isPastDeadline("2000-01-01T00:00:00.000Z")).toBe(true);
    expect(isPastDeadline("2999-01-01T00:00:00.000Z")).toBe(false);
  });
});
