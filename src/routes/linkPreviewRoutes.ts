// Slice 9 — link preview routes.

import { Router } from "express";
import { handleGetLinkPreview } from "../controllers/linkPreviewController.js";

const router = Router();

router.get("/", handleGetLinkPreview);

export default router;
