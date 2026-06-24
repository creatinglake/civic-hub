import { describe, it, expect } from "vitest";
import {
  isValidTransition,
  getNextStatus,
  getAllowedActions,
} from "../../src/modules/civic.review/transitions.js";

describe("Review state machine transitions", () => {
  describe("from pending_review", () => {
    it("admin can approve → approved", () => {
      expect(isValidTransition("pending_review", "approve", "admin")).toBe(true);
      expect(getNextStatus("pending_review", "approve", "admin")).toBe("approved");
    });

    it("admin can request changes → changes_requested", () => {
      expect(isValidTransition("pending_review", "request_changes", "admin")).toBe(true);
      expect(getNextStatus("pending_review", "request_changes", "admin")).toBe("changes_requested");
    });

    it("admin can decline → declined", () => {
      expect(isValidTransition("pending_review", "decline", "admin")).toBe(true);
      expect(getNextStatus("pending_review", "decline", "admin")).toBe("declined");
    });

    it("creator can withdraw → withdrawn", () => {
      expect(isValidTransition("pending_review", "withdraw", "creator")).toBe(true);
      expect(getNextStatus("pending_review", "withdraw", "creator")).toBe("withdrawn");
    });

    it("creator cannot approve", () => {
      expect(isValidTransition("pending_review", "approve", "creator")).toBe(false);
    });

    it("creator cannot decline", () => {
      expect(isValidTransition("pending_review", "decline", "creator")).toBe(false);
    });
  });

  describe("from changes_requested", () => {
    it("creator can revise and resubmit → pending_review", () => {
      expect(isValidTransition("changes_requested", "revise_resubmit", "creator")).toBe(true);
      expect(getNextStatus("changes_requested", "revise_resubmit", "creator")).toBe("pending_review");
    });

    it("creator can withdraw → withdrawn", () => {
      expect(isValidTransition("changes_requested", "withdraw", "creator")).toBe(true);
      expect(getNextStatus("changes_requested", "withdraw", "creator")).toBe("withdrawn");
    });

    it("admin cannot approve directly from changes_requested", () => {
      expect(isValidTransition("changes_requested", "approve", "admin")).toBe(false);
    });
  });

  describe("terminal states", () => {
    it("no actions allowed from approved", () => {
      expect(getAllowedActions("approved", "admin")).toEqual([]);
      expect(getAllowedActions("approved", "creator")).toEqual([]);
    });

    it("no actions allowed from declined", () => {
      expect(getAllowedActions("declined", "admin")).toEqual([]);
      expect(getAllowedActions("declined", "creator")).toEqual([]);
    });

    it("no actions allowed from withdrawn", () => {
      expect(getAllowedActions("withdrawn", "admin")).toEqual([]);
      expect(getAllowedActions("withdrawn", "creator")).toEqual([]);
    });
  });

  describe("getNextStatus throws on invalid", () => {
    it("throws for invalid transition", () => {
      expect(() => getNextStatus("approved", "approve", "admin")).toThrow("Invalid transition");
    });
  });

  describe("getAllowedActions", () => {
    it("admin has 3 actions from pending_review", () => {
      const actions = getAllowedActions("pending_review", "admin");
      expect(actions).toHaveLength(3);
      expect(actions).toContain("approve");
      expect(actions).toContain("request_changes");
      expect(actions).toContain("decline");
    });

    it("creator has 1 action from pending_review (withdraw)", () => {
      expect(getAllowedActions("pending_review", "creator")).toEqual(["withdraw"]);
    });

    it("creator has 2 actions from changes_requested", () => {
      const actions = getAllowedActions("changes_requested", "creator");
      expect(actions).toHaveLength(2);
      expect(actions).toContain("revise_resubmit");
      expect(actions).toContain("withdraw");
    });
  });
});
