// Auth middleware — enforces identity on action endpoints.
//
// Three guards, ordered from loosest to strictest:
//   requireAuth      — valid session token (user exists, token not expired)
//   requireResident  — requireAuth + user.is_resident === true
//   requireAdmin     — requireAuth + email ∈ CIVIC_ADMIN_EMAILS
//
// The authenticated user is placed on `res.locals.authUser`. Controllers
// read the actor from there, NOT from request bodies. This closes the hole
// where any caller could POST { actor: "<anyone>" } and act as that user.

import { NextFunction, Request, Response } from "express";
import { getUserFromToken, type User } from "../modules/civic.auth/index.js";

function extractToken(req: Request): string | null {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Bearer ")) {
    return auth.slice(7);
  }
  return null;
}

function adminEmails(): Set<string> {
  const raw = process.env.CIVIC_ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

/**
 * Require a valid session token. Attaches `res.locals.authUser`.
 */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
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
    res.locals.authUser = user;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

/**
 * Require a valid session AND a user who has affirmed residency.
 * Use this for all civic-participation actions (vote, support, submit, etc.).
 */
export async function requireResident(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await requireAuth(req, res, async () => {
    const user = res.locals.authUser as User | undefined;
    if (!user) {
      // requireAuth already responded
      return;
    }
    if (!user.is_resident) {
      res.status(403).json({
        error: "Residency affirmation required to participate",
      });
      return;
    }
    next();
  });
}

/**
 * Require an authenticated user whose email is in CIVIC_ADMIN_EMAILS.
 * The env var is a comma-separated list; email matching is case-insensitive.
 */
export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await requireAuth(req, res, async () => {
    const user = res.locals.authUser as User | undefined;
    if (!user) return;

    const allowed = adminEmails();
    if (allowed.size === 0) {
      // Fail safely: no admins configured means nobody is admin.
      res.status(503).json({
        error:
          "Admin access is not configured. Set CIVIC_ADMIN_EMAILS on the server.",
      });
      return;
    }
    if (!allowed.has(user.email.toLowerCase())) {
      res.status(403).json({ error: "Admin access required" });
      return;
    }
    next();
  });
}

/**
 * Helper: pull the authenticated user from res.locals, or throw 500.
 * Use inside controllers that are gated by requireAuth/requireResident/requireAdmin.
 */
export function getAuthUser(res: Response): User {
  const user = res.locals.authUser as User | undefined;
  if (!user) {
    throw new Error(
      "getAuthUser called on an unauthenticated route (middleware missing)",
    );
  }
  return user;
}
