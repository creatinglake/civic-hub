// Feedback routes
//
// POST /feedback — submit product feedback (anonymous or authenticated)

import { Router } from "express";
import { handleSubmitFeedback } from "../controllers/feedbackController.js";

const router = Router();

router.post("/", handleSubmitFeedback);

export default router;
