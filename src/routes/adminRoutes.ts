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
  handleAdminListVoteResults,
  handleAdminGetVoteResults,
  handlePatchVoteResults,
  handleApproveVoteResults,
} from "../controllers/adminVoteResultsController.js";
import {
  handleAdminGetMeetingSummary,
  handleAdminListMeetingSummaries,
  handleApproveMeetingSummary,
  handlePatchMeetingSummary,
} from "../controllers/meetingSummaryController.js";
import {
  handleGetSettings,
  handlePatchSettings,
} from "../controllers/adminSettingsController.js";
import { requireAdmin } from "../middleware/auth.js";

const router = Router();

router.use(requireAdmin);

// Proposals
router.get("/proposals", handleAdminListProposals);
router.get("/proposals/:id", handleAdminGetProposal);
router.post("/proposals/:id/convert", handleConvertProposal);
router.post("/proposals/:id/archive", handleArchiveProposal);

// Vote results (renamed from /admin/briefs in Slice 8.5; the underlying
// process type is civic.vote_results, formerly civic.brief).
router.get("/vote-results", handleAdminListVoteResults);
router.get("/vote-results/:id", handleAdminGetVoteResults);
router.patch("/vote-results/:id", handlePatchVoteResults);
router.post("/vote-results/:id/approve", handleApproveVoteResults);

// Meeting Summaries
router.get("/meeting-summaries", handleAdminListMeetingSummaries);
router.get("/meeting-summaries/:id", handleAdminGetMeetingSummary);
router.patch("/meeting-summaries/:id", handlePatchMeetingSummary);
router.post("/meeting-summaries/:id/approve", handleApproveMeetingSummary);

// Hub settings (admin-configurable; overrides env var fallbacks)
router.get("/settings", handleGetSettings);
router.patch("/settings", handlePatchSettings);

export default router;
