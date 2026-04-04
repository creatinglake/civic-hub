// Proposal routes — user-facing proposal submission and endorsement
//
// POST /proposals           — submit a new proposal
// GET  /proposals           — list proposals (optional ?status= filter)
// GET  /proposals/:id       — get proposal detail (optional ?actor= for support status)
// POST /proposals/:id/support — endorse a proposal

import { Router } from "express";
import {
  handleSubmitProposal,
  handleListProposals,
  handleGetProposal,
  handleSupportProposal,
} from "../controllers/proposalController.js";

const router = Router();

router.post("/", handleSubmitProposal);
router.get("/", handleListProposals);
router.get("/:id", handleGetProposal);
router.post("/:id/support", handleSupportProposal);

export default router;
