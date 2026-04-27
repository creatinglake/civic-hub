import { Router } from "express";
import { handleGetVoteResults } from "../controllers/voteResultsController.js";

const router = Router();

// Public — no auth required. Returns 404 for unpublished records.
router.get("/:id", handleGetVoteResults);

export default router;
