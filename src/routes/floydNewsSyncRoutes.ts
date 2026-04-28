// Floyd-news-sync routes.
//
// Single mount point: /internal/floyd-news-sync/run, gated by
// CRON_SECRET bearer auth (shared with the digest + meeting-summary
// crons). Triggered daily by Vercel Cron, also manually triggerable
// with the same auth for backfill or testing.

import { Router } from "express";
import { handleRunFloydNewsSync } from "../controllers/floydNewsSyncController.js";

export const floydNewsSyncCronRouter = Router();
floydNewsSyncCronRouter.post(
  "/floyd-news-sync/run",
  handleRunFloydNewsSync,
);
