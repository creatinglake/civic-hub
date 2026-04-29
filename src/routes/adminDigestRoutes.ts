// Admin digest routes — Slice 16.
//
// Single mount point: /internal/admin-digest/run, gated by
// CRON_SECRET bearer auth (shared with the user-digest +
// meeting-summary + floyd-news-sync crons). Triggered daily by
// Vercel Cron, manually triggerable with the same auth for testing.

import { Router } from "express";
import { handleRunAdminDigest } from "../controllers/adminDigestController.js";

export const adminDigestCronRouter = Router();
adminDigestCronRouter.post("/admin-digest/run", handleRunAdminDigest);
