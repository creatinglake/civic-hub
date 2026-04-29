// Auth routes — email-based authentication
//
// POST   /auth/request-code  — request verification code
// POST   /auth/verify        — verify code and get session
// POST   /auth/residency     — affirm Floyd County residency
// POST   /auth/accept-tos    — record legal acceptance
// GET    /auth/me            — get current user
// POST   /auth/logout        — destroy session
// DELETE /auth/me            — self-service account deletion (Slice 13.11)

import { Router } from "express";
import {
  handleRequestCode,
  handleVerify,
  handleAffirmResidency,
  handleAcceptTos,
  handleDeleteAccount,
  handleGetMe,
  handleLogout,
} from "../controllers/authController.js";

const router = Router();

router.post("/request-code", handleRequestCode);
router.post("/verify", handleVerify);
router.post("/residency", handleAffirmResidency);
router.post("/accept-tos", handleAcceptTos);
router.get("/me", handleGetMe);
router.delete("/me", handleDeleteAccount);
router.post("/logout", handleLogout);

export default router;
