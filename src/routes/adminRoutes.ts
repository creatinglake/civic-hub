// Admin routes — proposal review and conversion
//
// GET  /admin/proposals              — list proposals for admin review
// GET  /admin/proposals/:id          — get full proposal detail
// POST /admin/proposals/:id/convert  — convert endorsed proposal to civic.vote
// POST /admin/proposals/:id/archive  — archive (reject/shelve) a proposal

import { Router } from "express";
import {
  handleAdminListProposals,
  handleAdminGetProposal,
  handleConvertProposal,
  handleArchiveProposal,
} from "../controllers/adminController.js";

const router = Router();

router.get("/proposals", handleAdminListProposals);
router.get("/proposals/:id", handleAdminGetProposal);
router.post("/proposals/:id/convert", handleConvertProposal);
router.post("/proposals/:id/archive", handleArchiveProposal);

export default router;
