import { Router } from "express";
import { handleJoinWaitlist } from "../controllers/waitlistController.js";

const router = Router();

router.post("/", handleJoinWaitlist);

export default router;
