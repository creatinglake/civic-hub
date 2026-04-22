// Shared helpers for the hub's public URLs.
//
// The hub distinguishes between two origins:
//
// - BASE_URL — the API origin. Used for `source.hub_url` (federation
//   partners federate against this) and for `/.well-known/civic.json`
//   discovery.
// - CIVIC_UI_BASE_URL — the UI origin. Used for user-facing `action_url`
//   values in events. Per Civic Event Spec §3, `action_url` is a "link to
//   take action" — a human-reachable page, not a REST endpoint.
//
// In single-origin deployments (Vercel, where the UI is served from the
// same host as the API), CIVIC_UI_BASE_URL can be unset and will fall
// back to BASE_URL. In split-origin dev (API on :3000, UI on :5173), set
// CIVIC_UI_BASE_URL=http://localhost:5173 so emitted events link to the
// UI, not the JSON API.
//
// Both helpers strip trailing slashes so callers can do
// `${baseUrl()}/events` without producing double slashes.

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

export function baseUrl(): string {
  const raw = process.env.BASE_URL ?? "http://localhost:3000";
  return stripTrailingSlash(raw);
}

/**
 * The origin from which UI pages are served. Used to construct `action_url`
 * on events so citizens clicking through a feed post land on the UI, not
 * on a JSON API response. Falls back to the API base when unset.
 */
export function uiBaseUrl(): string {
  const raw = process.env.CIVIC_UI_BASE_URL ?? process.env.BASE_URL ?? "http://localhost:3000";
  return stripTrailingSlash(raw);
}
