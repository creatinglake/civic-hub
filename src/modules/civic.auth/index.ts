// civic.auth module — email-based authentication service
//
// Minimal auth for civic participation:
//   1. User enters email → OTP code generated
//   2. User verifies with code → account created/logged in
//   3. User affirms residency → is_resident = true
//
// DEV-ONLY: In-memory storage. OTP codes are logged to console (no email sending).
// No external network calls — compliant with CLAUDE.md constraints.
//
// GUARDRAIL: This module MUST NOT import from civic.vote or civic.proposals.

import { generateId } from "../../utils/id.js";
import type { User, PendingVerification, Session } from "./models.js";

export type { User, PendingVerification, Session } from "./models.js";

// --- In-memory stores (DEV-ONLY) ---

const users = new Map<string, User>();
const usersByEmail = new Map<string, string>(); // email → user ID
const pendingVerifications = new Map<string, PendingVerification>(); // email → pending
const sessions = new Map<string, Session>(); // token → session

// --- OTP generation ---

function generateOTP(): string {
  // 6-digit code
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken(): string {
  return generateId("sess");
}

// --- Auth flow ---

/**
 * Step 1: Request a verification code for an email.
 * If user exists, they'll be logged in on verify.
 * If not, a new account will be created on verify.
 *
 * DEV: Code is logged to console. In production, send via email.
 */
export function requestVerification(email: string): { message: string } {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Invalid email address");
  }

  const code = generateOTP();
  const now = new Date();
  const expires = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes

  pendingVerifications.set(normalizedEmail, {
    email: normalizedEmail,
    code,
    created_at: now.toISOString(),
    expires_at: expires.toISOString(),
  });

  // DEV-ONLY: Log code to console since we can't send email
  console.log(`\n[auth] Verification code for ${normalizedEmail}: ${code}\n`);

  return { message: "Verification code sent" };
}

/**
 * Step 2: Verify the code and create/login user.
 * Returns a session token and user object.
 */
export function verifyCode(
  email: string,
  code: string
): { token: string; user: User } {
  const normalizedEmail = email.trim().toLowerCase();

  const pending = pendingVerifications.get(normalizedEmail);
  if (!pending) {
    throw new Error("No pending verification for this email. Request a new code.");
  }

  // Check expiry
  if (new Date() > new Date(pending.expires_at)) {
    pendingVerifications.delete(normalizedEmail);
    throw new Error("Verification code expired. Request a new code.");
  }

  // Check code
  if (pending.code !== code) {
    throw new Error("Invalid verification code");
  }

  // Clear pending
  pendingVerifications.delete(normalizedEmail);

  // Find or create user
  let userId = usersByEmail.get(normalizedEmail);
  let user: User;

  if (userId && users.has(userId)) {
    user = users.get(userId)!;
    // Mark email as verified if not already
    user.email_verified = true;
  } else {
    // Create new user
    userId = generateId("user");
    user = {
      id: userId,
      email: normalizedEmail,
      email_verified: true,
      is_resident: false,
      created_at: new Date().toISOString(),
    };
    users.set(userId, user);
    usersByEmail.set(normalizedEmail, userId);

    console.log(`[auth] New user created: ${userId} (${normalizedEmail})`);
  }

  // Create session
  const token = generateToken();
  sessions.set(token, {
    token,
    user_id: userId,
    created_at: new Date().toISOString(),
  });

  return { token, user };
}

/**
 * Step 3: Affirm residency.
 * Must be called after authentication.
 */
export function affirmResidency(userId: string): User {
  const user = users.get(userId);
  if (!user) {
    throw new Error("User not found");
  }

  user.is_resident = true;

  console.log(`[auth] User ${userId} affirmed residency`);

  return user;
}

// --- Session management ---

/**
 * Get user from a session token.
 * Returns undefined if token is invalid.
 */
export function getUserFromToken(token: string): User | undefined {
  const session = sessions.get(token);
  if (!session) return undefined;
  return users.get(session.user_id);
}

/**
 * Get user by ID.
 */
export function getUser(userId: string): User | undefined {
  return users.get(userId);
}

/**
 * Logout — destroy session.
 */
export function logout(token: string): void {
  sessions.delete(token);
}

// --- Dev/test utilities ---

/** Clear all auth data — used by debug/seed only */
export function clearAuth(): void {
  users.clear();
  usersByEmail.clear();
  pendingVerifications.clear();
  sessions.clear();
}
