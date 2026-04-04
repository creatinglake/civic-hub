import { Router } from "express";
import { handleGetVoteLog, handleVerifyReceipt } from "../controllers/voteLogController.js";

const router = Router();

// GET /votes/:id/log — public vote audit log (only after close)
router.get("/:id/log", handleGetVoteLog);

// GET /votes/:id/verify?receipt=<receipt_id> — receipt verification
router.get("/:id/verify", handleVerifyReceipt);

export default router;
