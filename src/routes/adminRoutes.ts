// Admin routes — proposal review and conversion.
// Every route requires the authenticated user's email to be listed in
// the CIVIC_ADMIN_EMAILS env var.

import { Router } from "express";
import {
  handleAdminListProposals,
  handleAdminGetProposal,
  handleConvertProposal,
  handleArchiveProposal,
} from "../controllers/adminController.js";
import {
  handleAdminListBriefs,
  handleAdminGetBrief,
  handlePatchBrief,
  handleApproveBrief,
} from "../controllers/adminBriefController.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

router.use(requireAdmin);

// Proposals
router.get("/proposals", handleAdminListProposals);
router.get("/proposals/:id", handleAdminGetProposal);
router.post("/proposals/:id/convert", handleConvertProposal);
router.post("/proposals/:id/archive", handleArchiveProposal);

// Civic Briefs
router.get("/briefs", handleAdminListBriefs);
router.get("/briefs/:id", handleAdminGetBrief);
router.patch("/briefs/:id", handlePatchBrief);
router.post("/briefs/:id/approve", handleApproveBrief);

export default router;
