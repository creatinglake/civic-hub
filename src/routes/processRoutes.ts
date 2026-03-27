import { Router } from "express";
import {
  handleCreateProcess,
  handleGetProcess,
  handleProcessAction,
  handleListProcesses,
  handleGetProcessState,
} from "../controllers/processController.js";

const router = Router();

// Read layer — UI-friendly endpoints
router.get("/", handleListProcesses);
router.get("/:id/state", handleGetProcessState);

// Internal control surfaces
router.post("/", handleCreateProcess);
router.get("/:id", handleGetProcess);
router.post("/:id/action", handleProcessAction);

export default router;
