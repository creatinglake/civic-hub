// Input routes — community input endpoints

import { Router } from "express";
import { handleSubmitInput, handleGetInputs } from "../controllers/inputController.js";

const router = Router();

// POST /process/:id/input — submit community input
router.post("/:id/input", handleSubmitInput);

// GET /process/:id/input — get all inputs for a process
router.get("/:id/input", handleGetInputs);

export default router;
