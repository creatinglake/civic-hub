import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  handleGetReviewNotifications,
  handleMarkReviewsSeen,
} from "../controllers/reviewController.js";

const router = Router();

// requireAuth (not requireResident): admins poll this too, and an admin
// account may not have affirmed residency.
router.use(requireAuth);

router.get("/reviews/count", handleGetReviewNotifications);
router.post("/reviews/seen", handleMarkReviewsSeen);

export default router;
