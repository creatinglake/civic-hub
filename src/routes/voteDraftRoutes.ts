import { Router } from "express";
import {
  handleCreateVoteDraft,
  handleListVoteDrafts,
  handleGetVoteDraft,
  handleUpdateVoteDraft,
  handleSendVoteAssistantMessage,
  handleReviewVoteDraft,
  handleSubmitVoteDraft,
} from "../controllers/voteDraftController.js";
import { requireResident } from "../middleware/auth.js";

const router = Router();

router.post("/", requireResident, handleCreateVoteDraft);
router.get("/", requireResident, handleListVoteDrafts);
router.get("/:id", requireResident, handleGetVoteDraft);
router.patch("/:id", requireResident, handleUpdateVoteDraft);
router.post("/:id/assistant", requireResident, handleSendVoteAssistantMessage);
router.post("/:id/review", requireResident, handleReviewVoteDraft);
router.post("/:id/submit", requireResident, handleSubmitVoteDraft);

export default router;
