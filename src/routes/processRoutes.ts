import { Router } from "express";
import {
  handleCreateProcess,
  handleGetProcess,
  handleProcessAction,
  handleListProcesses,
  handleGetProcessState,
} from "../controllers/processController.js";
import { requireResident, requireAdmin } from "../middleware/auth.js";

const router = Router();

// Read layer — public
router.get("/", handleListProcesses);
router.get("/:id/state", handleGetProcessState);
router.get("/:id", handleGetProcess);

// Internal control surfaces — gated
// Creating a process directly (e.g. seeding, admin creation) is admin-only.
router.post("/", requireAdmin, handleCreateProcess);
// Actions on a process (vote, support, etc.) require residency.
router.post("/:id/action", requireResident, handleProcessAction);

export default router;
