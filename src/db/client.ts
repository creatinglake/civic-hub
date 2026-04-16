// Supabase client — the single point of database access for the backend.
//
// This module initializes one Supabase client using the SERVICE ROLE key.
// The service role key bypasses Row Level Security; it MUST only be used
// server-side. Never import this module from the UI.
//
// Env vars required (see .env.example):
//   SUPABASE_URL                  Project URL (e.g. https://xxx.supabase.co)
//   SUPABASE_SERVICE_ROLE_KEY     Service role secret (starts with eyJ…)

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

function read(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    throw new Error(
      `Missing required env var: ${name}. ` +
        `Set it in your local .env (see .env.example) or in Vercel project settings.`,
    );
  }
  return v;
}

/**
 * Returns a singleton Supabase client. Lazy — only reads env on first call so
 * that importing this module doesn't crash in contexts (tests, tooling) where
 * env may not be configured yet.
 */
export function getDb(): SupabaseClient {
  if (cached) return cached;

  const url = read("SUPABASE_URL");
  const key = read("SUPABASE_SERVICE_ROLE_KEY");

  cached = createClient(url, key, {
    auth: {
      // We don't use Supabase Auth; we have our own civic.auth module.
      persistSession: false,
      autoRefreshToken: false,
    },
    db: {
      schema: "public",
    },
  });

  return cached;
}

/**
 * Lightweight connectivity probe. Returns `{ ok: true }` on success,
 * `{ ok: false, error }` on failure. Used by /health.
 */
export async function pingDb(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    // HEAD + count is the cheapest query that proves the connection works
    // and RLS policy is respected by the service role.
    const { error } = await getDb()
      .from("users")
      .select("id", { count: "exact", head: true });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
