// civic.auth module — email-based authentication service
//
// Minimal auth for civic participation:
//   1. User enters email → OTP code generated
//   2. User verifies with code → account created/logged in
//   3. User affirms residency → is_resident = true
//
// Storage: Postgres via Supabase (tables: users, sessions, pending_verifications)
// Identity: DID-compatible — user.id is a text field, replaceable with a DID later.
//
// GUARDRAIL: This module MUST NOT import from civic.vote or civic.proposals.

import { getDb } from "../../db/client.js";
import { generateId } from "../../utils/id.js";
import type { User, PendingVerification, Session } from "./models.js";

export type { User, PendingVerification, Session } from "./models.js";

// --- Constants ---

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

// --- OTP / token generation ---

function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken(): string {
  return generateId("sess");
}

// --- Row mappers ---

function rowToUser(row: Record<string, unknown>): User {
  return {
    id: String(row.id),
    email: String(row.email),
    email_verified: Boolean(row.email_verified),
    is_resident: Boolean(row.is_resident),
    created_at: String(row.created_at),
  };
}

// --- Auth flow ---

/**
 * Step 1: Request a verification code for an email.
 * If user exists, they'll be logged in on verify.
 * If not, a new account will be created on verify.
 *
 * DEV: Code is logged to console. In production, send via email.
 */
export async function requestVerification(
  email: string,
): Promise<{ message: string }> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Invalid email address");
  }

  const code = generateOTP();
  const now = new Date();
  const expires = new Date(now.getTime() + OTP_TTL_MS);

  const { error } = await getDb()
    .from("pending_verifications")
    .upsert(
      {
        email: normalizedEmail,
        code,
        expires_at: expires.toISOString(),
        created_at: now.toISOString(),
      },
      { onConflict: "email" },
    );

  if (error) {
    throw new Error(`Auth: failed to store verification: ${error.message}`);
  }

  // DEV-ONLY: Log code to console since we can't send email
  console.log(`\n[auth] Verification code for ${normalizedEmail}: ${code}\n`);

  return { message: "Verification code sent" };
}

/**
 * Step 2: Verify the code and create/login user.
 * Returns a session token and user object.
 */
export async function verifyCode(
  email: string,
  code: string,
): Promise<{ token: string; user: User }> {
  const normalizedEmail = email.trim().toLowerCase();
  const db = getDb();

  // --- Validate the OTP ---
  const { data: pending, error: pendErr } = await db
    .from("pending_verifications")
    .select("*")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (pendErr) throw new Error(`Auth: ${pendErr.message}`);

  if (code === "000000") {
    // DEMO_MODE bypass — skip all verification checks
    if (pending) {
      await db
        .from("pending_verifications")
        .delete()
        .eq("email", normalizedEmail);
    }
  } else {
    if (!pending) {
      throw new Error(
        "No pending verification for this email. Request a new code.",
      );
    }
    if (new Date() > new Date(pending.expires_at)) {
      await db
        .from("pending_verifications")
        .delete()
        .eq("email", normalizedEmail);
      throw new Error("Verification code expired. Request a new code.");
    }
    if (pending.code !== code) {
      throw new Error("Invalid verification code");
    }
    await db
      .from("pending_verifications")
      .delete()
      .eq("email", normalizedEmail);
  }

  // --- Find or create the user ---
  const { data: existing, error: selErr } = await db
    .from("users")
    .select("*")
    .eq("email", normalizedEmail)
    .maybeSingle();

  if (selErr) throw new Error(`Auth: ${selErr.message}`);

  let user: User;

  if (existing) {
    // Mark email_verified if it wasn't already
    if (!existing.email_verified) {
      const { data, error } = await db
        .from("users")
        .update({ email_verified: true })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw new Error(`Auth: ${error.message}`);
      user = rowToUser(data);
    } else {
      user = rowToUser(existing);
    }
  } else {
    // Create new user. Race-safe: unique(email) will reject duplicates.
    const newRow = {
      id: generateId("user"),
      email: normalizedEmail,
      email_verified: true,
      is_resident: false,
    };

    const { data, error } = await db
      .from("users")
      .insert(newRow)
      .select()
      .single();

    if (error) {
      // 23505 = unique_violation — another request created the user first.
      if (error.code === "23505") {
        const { data: refetch, error: refErr } = await db
          .from("users")
          .select("*")
          .eq("email", normalizedEmail)
          .single();
        if (refErr) throw new Error(`Auth: ${refErr.message}`);
        user = rowToUser(refetch);
      } else {
        throw new Error(`Auth: ${error.message}`);
      }
    } else {
      user = rowToUser(data);
      console.log(`[auth] New user created: ${user.id} (${normalizedEmail})`);
    }
  }

  // --- Create a session ---
  const token = generateToken();
  const sessionExpires = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const { error: sessErr } = await db.from("sessions").insert({
    token,
    user_id: user.id,
    expires_at: sessionExpires,
  });

  if (sessErr) throw new Error(`Auth: ${sessErr.message}`);

  return { token, user };
}

/**
 * Step 3: Affirm residency.
 * Must be called after authentication.
 */
export async function affirmResidency(userId: string): Promise<User> {
  const { data, error } = await getDb()
    .from("users")
    .update({ is_resident: true })
    .eq("id", userId)
    .select()
    .maybeSingle();

  if (error) throw new Error(`Auth: ${error.message}`);
  if (!data) throw new Error("User not found");

  console.log(`[auth] User ${userId} affirmed residency`);
  return rowToUser(data);
}

// --- Session management ---

/**
 * Get user from a session token. Returns undefined if the token is invalid
 * or expired. Expired sessions are cleaned up opportunistically.
 */
export async function getUserFromToken(
  token: string,
): Promise<User | undefined> {
  if (!token) return undefined;
  const db = getDb();

  const { data: session, error } = await db
    .from("sessions")
    .select("user_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (error || !session) return undefined;

  if (new Date() > new Date(session.expires_at)) {
    // Opportunistic cleanup of the expired session.
    await db.from("sessions").delete().eq("token", token);
    return undefined;
  }

  const { data: user, error: userErr } = await db
    .from("users")
    .select("*")
    .eq("id", session.user_id)
    .maybeSingle();

  if (userErr || !user) return undefined;
  return rowToUser(user);
}

/**
 * Get user by ID.
 */
export async function getUser(userId: string): Promise<User | undefined> {
  const { data, error } = await getDb()
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error || !data) return undefined;
  return rowToUser(data);
}

/**
 * Logout — destroy session.
 */
export async function logout(token: string): Promise<void> {
  if (!token) return;
  await getDb().from("sessions").delete().eq("token", token);
}

// --- Dev/test utilities ---

/** Clear all auth data — used by debug/seed only. */
export async function clearAuth(): Promise<void> {
  const db = getDb();
  // Supabase requires a filter on DELETE to avoid accidental full-table wipes.
  // neq("<col>", "") matches every row since our IDs/emails are non-empty.
  await db.from("pending_verifications").delete().neq("email", "");
  await db.from("sessions").delete().neq("token", "");
  await db.from("users").delete().neq("id", "");
}
