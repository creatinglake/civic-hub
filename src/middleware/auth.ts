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

function parseEmailList(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),
  );
}

function adminEmails(): Set<string> {
  return parseEmailList(process.env.CIVIC_ADMIN_EMAILS);
}

function boardEmails(): Set<string> {
  return parseEmailList(process.env.CIVIC_BOARD_EMAILS);
}

/**
 * Derive the effective role for a user based on their email. Admins win
 * if their email is in both lists (so an admin who's also listed as a
 * Board member gets full admin privileges, not the narrower Board role).
 * Returns null if the user has no elevated role.
 */
export function roleForEmail(email: string | undefined | null): "admin" | "board" | null {
  if (!email) return null;
  const lower = email.toLowerCase();
  if (adminEmails().has(lower)) return "admin";
  if (boardEmails().has(lower)) return "board";
  return null;
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
 * Require an authenticated user whose email is in either
 * CIVIC_BOARD_EMAILS or CIVIC_ADMIN_EMAILS. Used for announcement
 * operations (post / edit).
 *
 * Sets `res.locals.effectiveRole` to `"admin"` or `"board"` so handlers
 * can stamp the author role on new announcements without recomputing.
 *
 * This is intentionally separate from requireAdmin: Board members get
 * this one capability (announcements) and nothing else. /admin/* routes
 * keep using requireAdmin (strict) so Board members can't reach them.
 */
export async function requireBoardOrAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  await requireAuth(req, res, async () => {
    const user = res.locals.authUser as User | undefined;
    if (!user) return;

    const role = roleForEmail(user.email);
    if (role === null) {
      res.status(403).json({ error: "Board or admin access required" });
      return;
    }

    res.locals.effectiveRole = role;
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
