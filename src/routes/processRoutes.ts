import { Router } from "express";
import {
  handleCreateProcess,
  handleGetProcess,
  handleProcessAction,
} from "../controllers/processController.js";

const router = Router();

router.post("/", handleCreateProcess);
router.get("/:id", handleGetProcess);
router.post("/:id/action", handleProcessAction);

export default router;
