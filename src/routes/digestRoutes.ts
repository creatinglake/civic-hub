// Digest routes — Slice 5.
//
// Three distinct mount points, each with different auth:
//   /internal/digest/run         — CRON_SECRET bearer, no user auth
//   /unsubscribe/digest          — token-as-credential, no user auth
//   /user/settings/digest        — requireAuth (session token)
//
// Kept in one file for simplicity; app.ts mounts each on its own path.

import { Router } from "express";
import {
  handlePatchDigestSubscription,
  handleRunDigest,
  handleUnsubscribeDigest,
} from "../controllers/digestController.js";
import { requireAuth } from "../middleware/auth.js";

export const digestCronRouter = Router();
digestCronRouter.post("/digest/run", handleRunDigest);

export const digestUnsubscribeRouter = Router();
digestUnsubscribeRouter.get("/digest", handleUnsubscribeDigest);

export const userSettingsRouter = Router();
userSettingsRouter.patch("/digest", requireAuth, handlePatchDigestSubscription);
