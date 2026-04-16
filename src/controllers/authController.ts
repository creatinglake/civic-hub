// Auth controller — handles HTTP request/response for auth endpoints
//
// Minimal email-based auth flow:
//   POST /auth/request-code  — send verification code to email
//   POST /auth/verify        — verify code, get session token
//   POST /auth/residency     — affirm Floyd County residency
//   GET  /auth/me            — get current user from session token
//   POST /auth/logout        — destroy session

import { Request, Response } from "express";
import {
  requestVerification,
  verifyCode,
  affirmResidency,
  getUserFromToken,
  logout,
} from "../modules/civic.auth/index.js";

/**
 * POST /auth/request-code
 * Body: { email: string }
 */
export async function handleRequestCode(
  req: Request,
  res: Response,
): Promise<void> {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({ error: "Missing required field: email" });
    return;
  }

  try {
    const result = await requestVerification(email);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: message });
  }
}

/**
 * POST /auth/verify
 * Body: { email: string, code: string }
 */
export async function handleVerify(
  req: Request,
  res: Response,
): Promise<void> {
  const { email, code } = req.body;

  if (!email || !code) {
    res.status(400).json({ error: "Missing required fields: email, code" });
    return;
  }

  try {
    const result = await verifyCode(email, code);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: message });
  }
}

/**
 * POST /auth/residency
 * Header: Authorization: Bearer <token>
 */
export async function handleAffirmResidency(
  req: Request,
  res: Response,
): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const user = await getUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  try {
    const updated = await affirmResidency(user.id);
    res.json({ user: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: message });
  }
}

/**
 * GET /auth/me
 * Header: Authorization: Bearer <token>
 */
export async function handleGetMe(
  req: Request,
  res: Response,
): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  const user = await getUserFromToken(token);
  if (!user) {
    res.status(401).json({ error: "Invalid or expired session" });
    return;
  }

  res.json({ user });
}

/**
 * POST /auth/logout
 * Header: Authorization: Bearer <token>
 */
export async function handleLogout(
  req: Request,
  res: Response,
): Promise<void> {
  const token = extractToken(req);
  if (token) {
    await logout(token);
  }
  res.json({ message: "Logged out" });
}

// --- Helpers ---

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return null;
}
