import { Router } from "express";
import { requireResident, requireAdmin } from "../middleware/auth.js";
import * as ctrl from "../controllers/deliberationController.js";

const router = Router();

// Public — list and detail
router.get("/", ctrl.listDeliberations);
router.get("/:processId", ctrl.getDeliberation);

// Public — cluster state (no auth needed to view opinion groups)
router.get("/:processId/clusters", ctrl.getClusterState);

// Participation — requires authenticated resident
router.post("/:processId/participate/vote", requireResident, ctrl.vote);
router.post("/:processId/participate/statement", requireResident, ctrl.submitStatement);
router.get("/:processId/participate/next", requireResident, ctrl.getNextStatement);

// Admin — create, start, close, regenerate summary
router.post("/", requireAdmin, ctrl.handleCreateDeliberation);
router.post("/:processId/start", requireAdmin, ctrl.handleStartDeliberation);
router.post("/:processId/close", requireAdmin, ctrl.closeDeliberation);
router.post("/:processId/regenerate", requireAdmin, ctrl.regenerateSummary);

export default router;
