// Slice 9 — upload routes (post-image, future: link-preview cache warm).
//
// The upload route deliberately skips express.json() so busboy can stream
// the multipart body directly. The global app-level express.json() runs
// only on application/json requests, so multipart bypasses it naturally;
// no router-level disabling is required.

import { Router } from "express";
import { requireAnnouncementPoster } from "../middleware/auth.js";
import { handlePostImageUpload } from "../controllers/uploadController.js";

const router = Router();

router.post(
  "/post-image",
  requireAnnouncementPoster,
  handlePostImageUpload,
);

export default router;
