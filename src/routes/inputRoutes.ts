// Input routes — community input endpoints
// POST requires residency; GET is public.

import { Router } from "express";
import { handleSubmitInput, handleGetInputs } from "../controllers/inputController.js";
import { requireResident } from "../middleware/auth.js";

const router = Router();

router.post("/:id/input", requireResident, handleSubmitInput);
router.get("/:id/input", handleGetInputs);

export default router;
