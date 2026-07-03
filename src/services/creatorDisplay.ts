// Central creator-display resolver.
//
// The SINGLE source of truth for turning a raw user id (e.g. "user_ab12")
// into the human-facing attribution shown next to content across the site:
// a display name plus whether that person is a hub admin.
//
// Name rule (applied EVERYWHERE — never deviate per-call-site):
//   display name = full_name ?? display_name ?? "Resident"
// We NEVER surface the raw user id and NEVER fall back to the email or an
// email-prefix. Unknown / missing / deleted ids resolve to "Resident".
//
// Admin rule:
//   is_admin = the user's email is in CIVIC_ADMIN_EMAILS (via isAdminEmail).
//
// Batch-first: resolveCreators() fetches every id in ONE query so list
// endpoints don't fan out into N per-row lookups. resolveCreator() is a thin
// convenience wrapper for the single-id (detail) case.

import { getDb } from "../db/client.js";
import { isAdminEmail } from "../middleware/auth.js";

export interface CreatorDisplay {
  name: string;
  is_admin: boolean;
}

/** The value used for any id we can't resolve to a real person. */
const FALLBACK: CreatorDisplay = { name: "Resident", is_admin: false };

interface UserRow {
  id: string;
  full_name: string | null;
  display_name: string | null;
  email: string | null;
}

function rowToDisplay(row: UserRow): CreatorDisplay {
  const name = row.full_name?.trim() || row.display_name?.trim() || "Resident";
  return { name, is_admin: isAdminEmail(row.email) };
}

/**
 * Batch-resolve a set of user ids to their display attribution in ONE query.
 *
 * - Dedupes ids and ignores empty / falsy entries.
 * - Returns an empty map (and runs NO query) when there is nothing to resolve.
 * - Unknown / missing ids are simply absent from the map; callers should treat
 *   a miss as the "Resident" fallback (getCreator() below does this for you).
 */
export async function resolveCreators(
  ids: string[],
): Promise<Map<string, CreatorDisplay>> {
  const unique = Array.from(
    new Set(ids.filter((id): id is string => typeof id === "string" && id.length > 0)),
  );
  const map = new Map<string, CreatorDisplay>();
  if (unique.length === 0) return map;

  // select("*") rather than naming columns: creator attribution must survive
  // schema drift (e.g. a DB that hasn't applied the display_name migration).
  // Naming a missing column hard-errors; "*" returns whatever exists and
  // rowToDisplay reads name fields defensively.
  const { data, error } = await getDb()
    .from("users")
    .select("*")
    .in("id", unique);
  if (error) {
    // Attribution is a display nicety; a resolver failure must never crash the
    // content it annotates. Degrade every id to the "Resident" fallback.
    console.error(
      `[creatorDisplay] resolve failed, using Resident fallback: ${error.message}`,
    );
    return map;
  }

  for (const row of (data ?? []) as UserRow[]) {
    map.set(row.id, rowToDisplay(row));
  }
  return map;
}

/** Single-id convenience wrapper. Falls back to "Resident" on any miss. */
export async function resolveCreator(id: string): Promise<CreatorDisplay> {
  if (!id) return { ...FALLBACK };
  const map = await resolveCreators([id]);
  return map.get(id) ?? { ...FALLBACK };
}

/**
 * Read from a pre-resolved map, applying the "Resident" fallback for misses.
 * Use inside list mappers after a single resolveCreators() call.
 */
export function getCreator(
  map: Map<string, CreatorDisplay>,
  id: string | null | undefined,
): CreatorDisplay {
  if (!id) return { ...FALLBACK };
  return map.get(id) ?? { ...FALLBACK };
}

/**
 * Enrich a single read-model object with resolved creator fields and REDACT
 * the raw id from public output.
 *
 * Adds `creator_name` + `creator_is_admin`, then blanks the raw-id field named
 * by `rawIdField` (default "created_by") UNLESS `keepRawId` is true (admin /
 * moderation responses that need the id for unique identification).
 *
 * The raw id to resolve is read from `model[rawIdField]` before redaction.
 */
export async function enrichCreator(
  model: Record<string, unknown>,
  opts: { rawIdField?: string; keepRawId?: boolean } = {},
): Promise<Record<string, unknown>> {
  const field = opts.rawIdField ?? "created_by";
  const rawId = typeof model[field] === "string" ? (model[field] as string) : "";
  const creator = await resolveCreator(rawId);
  const out: Record<string, unknown> = {
    ...model,
    creator_name: creator.name,
    creator_is_admin: creator.is_admin,
  };
  if (!opts.keepRawId) out[field] = "";
  return out;
}

/**
 * Batch variant of enrichCreator for list responses. Collects the raw ids from
 * every row, resolves them in ONE query, then maps — no per-row lookup.
 */
export async function enrichCreators(
  models: Record<string, unknown>[],
  opts: { rawIdField?: string; keepRawId?: boolean } = {},
): Promise<Record<string, unknown>[]> {
  const field = opts.rawIdField ?? "created_by";
  const ids = models
    .map((m) => (typeof m[field] === "string" ? (m[field] as string) : ""))
    .filter((id) => id.length > 0);
  const map = await resolveCreators(ids);
  return models.map((m) => {
    const rawId = typeof m[field] === "string" ? (m[field] as string) : "";
    const creator = getCreator(map, rawId);
    const out: Record<string, unknown> = {
      ...m,
      creator_name: creator.name,
      creator_is_admin: creator.is_admin,
    };
    if (!opts.keepRawId) out[field] = "";
    return out;
  });
}
