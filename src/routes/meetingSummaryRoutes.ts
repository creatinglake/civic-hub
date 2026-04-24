// Meeting-summary routes.
//
// Two mount points with different auth:
//   /internal/meeting-summary/run   — CRON_SECRET bearer (cron)
//   /meeting-summary/:id            — public GET of published summaries
//
// Admin routes (GET/PATCH list, GET/POST :id/approve) are mounted on
// /admin/meeting-summaries via adminRoutes.ts, reusing the existing
// requireAdmin guard.

import { Router } from "express";
import {
  handleGetPublicMeetingSummary,
  handleRunMeetingSummary,
} from "../controllers/meetingSummaryController.js";

export const meetingSummaryCronRouter = Router();
meetingSummaryCronRouter.post("/meeting-summary/run", handleRunMeetingSummary);

const publicRouter = Router();
publicRouter.get("/:id", handleGetPublicMeetingSummary);

export default publicRouter;
