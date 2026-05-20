import { Router } from "express";
import {
  handleCreateDraft,
  handleListDrafts,
  handleGetDraft,
  handleUpdateDraft,
  handleSendAssistantMessage,
  handleReviewDraft,
  handleSubmitDraft,
} from "../controllers/proposalDraftController.js";
import { requireResident } from "../middleware/auth.js";

const router = Router();

router.post("/", requireResident, handleCreateDraft);
router.get("/", requireResident, handleListDrafts);
router.get("/:id", requireResident, handleGetDraft);
router.patch("/:id", requireResident, handleUpdateDraft);
router.post("/:id/assistant", requireResident, handleSendAssistantMessage);
router.post("/:id/review", requireResident, handleReviewDraft);
router.post("/:id/submit", requireResident, handleSubmitDraft);

export default router;
