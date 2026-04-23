// Announcement routes.
//
// POST /announcement          — create (Board or admin)
// PATCH /announcement/:id     — edit (author-only unless admin)
// GET /announcement/:id       — public read
// GET /announcements          — public list (handled via a separate router
//                                mount; see app.ts)

import { Router } from "express";
import {
  handleCreateAnnouncement,
  handleGetAnnouncement,
  handleUpdateAnnouncement,
} from "../controllers/announcementController.js";
import { requireBoardOrAdmin } from "../middleware/auth.js";

const router = Router();

router.post("/", requireBoardOrAdmin, handleCreateAnnouncement);
router.patch("/:id", requireBoardOrAdmin, handleUpdateAnnouncement);
router.get("/:id", handleGetAnnouncement);

export default router;
