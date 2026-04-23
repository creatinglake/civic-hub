// civic.auth module — type definitions
//
// Minimal email-based auth for civic participation.
// No passwords, no complex identity verification.
// DID-compatible: user.id can be replaced with a DID in Phase 2.
//
// GUARDRAIL: This module MUST NOT import from civic.vote or civic.proposals.

/** A civic hub user */
export interface User {
  id: string;
  email: string;
  email_verified: boolean;
  is_resident: boolean;
  created_at: string; // ISO 8601
  /**
   * Opt-out flag for the daily email digest. Defaults to true on account
   * creation; flipped off via an unsubscribe link in every digest email
   * or via the UI settings page. Slice 5.
   */
  digest_subscribed: boolean;
  /**
   * Cursor for the next digest's "since" window. null means "never
   * sent" — the cron uses the user's created_at as the since anchor,
   * capped to 30 days ago.
   */
  last_digest_sent_at: string | null;
}

/** Pending verification — an OTP code sent to an email */
export interface PendingVerification {
  email: string;
  code: string;
  created_at: string;
  expires_at: string;
}

/** Session — maps a token to a user ID */
export interface Session {
  token: string;
  user_id: string;
  created_at: string;
}
