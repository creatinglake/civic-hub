// Shared helper for the hub's public base URL.
//
// Strips any trailing slash so callers can safely do `${baseUrl()}/events`
// without producing `https://host//events`. Defensive against env values
// like "https://civic-hub-two.vercel.app/" (with trailing slash).

export function baseUrl(): string {
  const raw = process.env.BASE_URL ?? "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}
