// Hub settings service — read/write for the hub_settings key-value table.
//
// First consumer: brief recipient emails. The admin UI writes here, the
// brief approval flow reads here first and falls back to the
// BOARD_RECIPIENT_EMAIL env var if no row exists yet.
//
// Extendable: add more keys as other admin-configurable settings appear.

import { getDb } from "../db/client.js";

export const SETTING_KEYS = {
  BRIEF_RECIPIENT_EMAILS: "brief_recipient_emails",
} as const;

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];

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
 * Resolve the brief recipient list — DB setting first, BOARD_RECIPIENT_EMAIL
 * env var as a safety-net fallback. Returns a trimmed, deduped,
 * non-empty list. Empty result means "no recipient configured anywhere".
 */
export async function getBriefRecipients(): Promise<string[]> {
  const stored = await getSetting(SETTING_KEYS.BRIEF_RECIPIENT_EMAILS);
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

export async function setBriefRecipients(
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
    SETTING_KEYS.BRIEF_RECIPIENT_EMAILS,
    cleaned.join(","),
    updatedBy,
  );
  return cleaned;
}
