// Hub settings service — read/write for the hub_settings key-value table.
//
// First consumer: vote-results recipient emails (the Board of Supervisors,
// historically). The admin UI writes here, the vote-results approval
// flow reads here first and falls back to the BOARD_RECIPIENT_EMAIL
// env var if no row exists yet.
//
// Extendable: add more keys as other admin-configurable settings appear.

import { getDb } from "../db/client.js";

// IMPORTANT: the underlying DB key remains "brief_recipient_emails" for
// historical reasons — it predates Slice 8.5's rename and live operator
// configurations already use this name. Renaming the storage key would
// require a separate hub_settings migration and operator coordination,
// neither of which is in scope here. Only the JS/TS function name was
// updated for code-level clarity.
export const SETTING_KEYS = {
  VOTE_RESULTS_RECIPIENT_EMAILS: "brief_recipient_emails",
  ANNOUNCEMENT_AUTHORS: "announcement_authors",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

/**
 * A non-admin user the admin has authorized to post Civic Hub
 * announcements. `label` is rendered verbatim on the feed and the public
 * announcement page ("{label} announcement: …", eyebrow "{LABEL}
 * ANNOUNCEMENT"). Free-form so a hub can use "Board member", "Planning
 * Committee", "Guest speaker", etc.
 *
 * Admins always post and are displayed as "Admin" regardless of whether
 * they appear in this list.
 */
export interface AnnouncementAuthor {
  email: string;
  label: string;
}

interface SettingRow {
  key: string;
  value: string;
  updated_at: string;
  updated_by: string | null;
}

export async function getSetting(key: string): Promise<string | null> {
  const { data, error } = await getDb()
    .from("hub_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw new Error(`hubSettings.get: ${error.message}`);
  return (data as { value: string } | null)?.value ?? null;
}

export async function setSetting(
  key: string,
  value: string,
  updatedBy: string | null,
): Promise<void> {
  const { error } = await getDb()
    .from("hub_settings")
    .upsert({ key, value, updated_by: updatedBy }, { onConflict: "key" });
  if (error) throw new Error(`hubSettings.set: ${error.message}`);
}

export async function getAllSettings(): Promise<Record<string, SettingRow>> {
  const { data, error } = await getDb()
    .from("hub_settings")
    .select("*");
  if (error) throw new Error(`hubSettings.getAll: ${error.message}`);
  const out: Record<string, SettingRow> = {};
  for (const row of (data ?? []) as SettingRow[]) {
    out[row.key] = row;
  }
  return out;
}

/**
 * Resolve the vote-results recipient list — DB setting first,
 * BOARD_RECIPIENT_EMAIL env var as a safety-net fallback. Returns a
 * trimmed, deduped, non-empty list. Empty result means "no recipient
 * configured anywhere".
 */
export async function getVoteResultsRecipients(): Promise<string[]> {
  const stored = await getSetting(SETTING_KEYS.VOTE_RESULTS_RECIPIENT_EMAILS);
  const raw = stored ?? process.env.BOARD_RECIPIENT_EMAIL ?? "";
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push(trimmed);
  }
  return out;
}

export async function setVoteResultsRecipients(
  emails: string[],
  updatedBy: string | null,
): Promise<string[]> {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of emails) {
    const trimmed = typeof raw === "string" ? raw.trim() : "";
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    cleaned.push(trimmed);
  }
  await setSetting(
    SETTING_KEYS.VOTE_RESULTS_RECIPIENT_EMAILS,
    cleaned.join(","),
    updatedBy,
  );
  return cleaned;
}

/**
 * Read the admin-configured author list. Falls back to the
 * CIVIC_BOARD_EMAILS env var (each entry labeled "Board member") when no
 * DB row exists, so deploys before an admin has visited the settings
 * panel keep working with their prior env-var configuration.
 */
export async function getAnnouncementAuthors(): Promise<AnnouncementAuthor[]> {
  const stored = await getSetting(SETTING_KEYS.ANNOUNCEMENT_AUTHORS);
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as unknown;
      if (Array.isArray(parsed)) {
        return normalizeAuthors(parsed);
      }
    } catch {
      // Fall through to env var — corrupt row shouldn't lock out Board
      // members who worked yesterday.
    }
  }
  // Env var fallback: CIVIC_BOARD_EMAILS → all entries labeled "Board member"
  const envRaw = process.env.CIVIC_BOARD_EMAILS ?? "";
  const envList = envRaw
    .split(",")
    .map((e) => e.trim())
    .filter((e) => e.length > 0)
    .map((email) => ({ email, label: "Board member" }));
  return normalizeAuthors(envList);
}

export async function setAnnouncementAuthors(
  authors: AnnouncementAuthor[],
  updatedBy: string | null,
): Promise<AnnouncementAuthor[]> {
  const cleaned = normalizeAuthors(authors);
  await setSetting(
    SETTING_KEYS.ANNOUNCEMENT_AUTHORS,
    JSON.stringify(cleaned),
    updatedBy,
  );
  return cleaned;
}

/** Trim, dedup by lowercase email, drop empty. Preserve caller order. */
function normalizeAuthors(raw: unknown[]): AnnouncementAuthor[] {
  const seen = new Set<string>();
  const out: AnnouncementAuthor[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as { email?: unknown; label?: unknown };
    const email = typeof e.email === "string" ? e.email.trim() : "";
    const label = typeof e.label === "string" ? e.label.trim() : "";
    if (!email || !label) continue;
    const lower = email.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    out.push({ email, label });
  }
  return out;
}

/**
 * Look up an email in the announcement author list. Returns the label to
 * stamp on new announcements and render on their public page, or null if
 * the email isn't authorized.
 */
export async function lookupAuthorLabel(
  email: string | undefined | null,
): Promise<string | null> {
  if (!email) return null;
  const lower = email.toLowerCase();
  const authors = await getAnnouncementAuthors();
  for (const a of authors) {
    if (a.email.toLowerCase() === lower) return a.label;
  }
  return null;
}
