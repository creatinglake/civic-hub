/**
 * Auth service — handles communication with /auth endpoints.
 * Manages session token in localStorage.
 */

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "/api";

async function request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }

  return res.json();
}

// --- Types ---

export interface AuthUser {
  id: string;
  email: string;
  email_verified: boolean;
  is_resident: boolean;
  created_at: string;
  /**
   * Slice 5 — subscription to the daily email digest. Opt-out: defaults
   * to true on account creation. Flipped via the Settings page or the
   * unsubscribe link in every digest email.
   */
  digest_subscribed: boolean;
  /**
   * Slice 11 — most recent legal-document version this user accepted
   * (e.g. "1.0"). null means the user has never accepted; the UI shows
   * the blocking re-acceptance modal until set or until the value
   * matches CURRENT_LEGAL_VERSION.
   */
  tos_version_accepted: string | null;
  tos_accepted_at: string | null;
}

/**
 * Permission role derived server-side. "admin" = full admin panel
 * access. "author" = user authorized to post announcements (via the
 * admin-managed list in hub_settings, with CIVIC_BOARD_EMAILS as a
 * fallback). null = regular resident with no special privileges.
 */
export type AuthRole = "admin" | "author" | null;

// --- Token storage ---

const TOKEN_KEY = "civic_auth_token";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// --- API calls ---

export function requestCode(email: string): Promise<{ message: string }> {
  return request("POST", "/auth/request-code", { email });
}

export function verifyCode(
  email: string,
  code: string
): Promise<{
  token: string;
  user: AuthUser;
  role: AuthRole;
  author_label: string | null;
}> {
  return request("POST", "/auth/verify", { email, code });
}

export function affirmResidency(token: string): Promise<{ user: AuthUser }> {
  return request("POST", "/auth/residency", undefined, token);
}

/**
 * Slice 11 — record that the authenticated user has accepted the named
 * version of the Hub's bundled legal documents. Called from both the
 * sign-up flow (via the acceptance checkbox in AuthModal) and the
 * re-acceptance modal that fires when a user's stored version is
 * stale. Server stamps tos_version_accepted + tos_accepted_at.
 */
export function acceptTos(
  token: string,
  version: string,
): Promise<{ user: AuthUser }> {
  return request("POST", "/auth/accept-tos", { version }, token);
}

export function getMe(
  token: string,
): Promise<{ user: AuthUser; role: AuthRole; author_label: string | null }> {
  return request("GET", "/auth/me", undefined, token);
}

export function logoutApi(token: string): Promise<{ message: string }> {
  return request("POST", "/auth/logout", undefined, token);
}
