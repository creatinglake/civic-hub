// Input routes — community input endpoints
// POST requires residency; GETs are public.

import { Router } from "express";
import {
  handleSubmitInput,
  handleGetInputs,
  handleGetCommentIdentityMode,
} from "../controllers/inputController.js";
import { requireResident } from "../middleware/auth.js";

const router = Router();

// Static path first so it can't be shadowed by the :id matcher.
router.get("/input/identity-mode", handleGetCommentIdentityMode);
router.post("/:id/input", requireResident, handleSubmitInput);
router.get("/:id/input", handleGetInputs);

export default router;
