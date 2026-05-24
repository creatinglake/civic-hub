import { Router } from "express";
import {
  handleCreateProject,
  handleListProjects,
  handleGetProject,
  handleAddUpdate,
  handleSetSentiment,
  handleAddComment,
  handleListComments,
} from "../controllers/projectController.js";
import { requireResident } from "../middleware/auth.js";

const router = Router();

router.post("/", requireResident, handleCreateProject);
router.get("/", handleListProjects);
router.get("/:id", handleGetProject);
router.post("/:id/updates", requireResident, handleAddUpdate);
router.post("/:id/sentiment", requireResident, handleSetSentiment);
router.post("/:id/comments", requireResident, handleAddComment);
router.get("/:id/comments", handleListComments);

export default router;
