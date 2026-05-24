import { Router } from "express";
import {
  handleCreateProjectDraft,
  handleGetProjectDraft,
  handleUpdateProjectDraft,
  handleSendProjectAssistantMessage,
  handleReviewProjectDraft,
  handleSubmitProjectDraft,
} from "../controllers/projectDraftController.js";
import { requireAuth, requireResident } from "../middleware/auth.js";

const router = Router();

router.post("/", requireResident, handleCreateProjectDraft);
router.get("/:id", requireAuth, handleGetProjectDraft);
router.patch("/:id", requireAuth, handleUpdateProjectDraft);
router.post("/:id/assistant", requireAuth, handleSendProjectAssistantMessage);
router.post("/:id/review", requireAuth, handleReviewProjectDraft);
router.post("/:id/submit", requireResident, handleSubmitProjectDraft);

export default router;
