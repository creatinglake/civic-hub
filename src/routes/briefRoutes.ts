import { Router } from "express";
import { handleGetBrief } from "../controllers/briefController.js";

const router = Router();

// Public — no auth required. Returns 404 for unpublished briefs.
router.get("/:id", handleGetBrief);

export default router;
