// Debug routes — seed data for rapid testing
// NOT for production use

import { Router } from "express";
import { handleSeed } from "../controllers/debugController.js";

const router = Router();

router.get("/seed", handleSeed);

export default router;
