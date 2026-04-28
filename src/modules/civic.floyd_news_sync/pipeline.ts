// civic.floyd_news_sync — orchestration pipeline
//
// Pure module boundary: takes injected fetch / Claude callbacks, returns
// a structured list of valid, future-or-undated entries ready for the
// host hub to ingest as civic.announcement rows.

import type { FloydNewsEntry, FloydNewsSyncConfig } from "./models.js";
import {
  isFutureOrUndated,
  isValidEntry,
  trimNewsHtml,
} from "./connector.js";
import { buildDiscoveryPrompt } from "./prompts.js";
import { parseJsonArray } from "../civic.meeting_summary/index.js";

export type FetchHtmlFn = (url: string) => Promise<string>;
export type CallClaudeFn = (req: {
  model: string;
  userText: string;
  maxTokens?: number;
}) => Promise<{ text: string; model: string }>;

export interface DiscoverDeps {
  fetchHtml: FetchHtmlFn;
  callClaude: CallClaudeFn;
}

/**
 * Fetch the listing page, ask Claude for structured entries, validate
 * each one, and filter by date. Returns the list of entries the
 * controller should consider ingesting (further deduped by share_url
 * against existing rows).
 */
export async function discoverNewsEntries(
  cfg: FloydNewsSyncConfig,
  deps: DiscoverDeps,
  today_iso: string,
): Promise<FloydNewsEntry[]> {
  const rawHtml = await deps.fetchHtml(cfg.source_url);
  const trimmed = trimNewsHtml(rawHtml);
  console.log(
    `[floyd-news-sync] trimmed html ${bytes(rawHtml)} → ${bytes(trimmed)}`,
  );

  const prompt = buildDiscoveryPrompt({
    trimmed_html: trimmed,
    source_url: cfg.source_url,
    today_iso,
  });

  const { text } = await deps.callClaude({
    model: cfg.model,
    userText: prompt,
    // 8k is plenty for a 50-entry cap with terse fields. Larger limits
    // tempt the model into a long-running generation that doesn't add
    // value here.
    maxTokens: 8_000,
  });

  let parsed: unknown[];
  try {
    parsed = parseJsonArray(text);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "parse failed";
    throw new Error(`Floyd news discovery parse failed: ${msg}`);
  }

  const valid: FloydNewsEntry[] = [];
  let dropped = 0;
  for (const raw of parsed) {
    if (isValidEntry(raw)) {
      valid.push(raw);
    } else {
      dropped += 1;
      console.warn(
        `[floyd-news-sync] dropping malformed entry: ${JSON.stringify(raw).slice(0, 200)}`,
      );
    }
  }

  const future = valid.filter((e) => isFutureOrUndated(e, today_iso));
  const filteredOut = valid.length - future.length;

  console.log(
    `[floyd-news-sync] discovered ${parsed.length} raw, ${valid.length} valid, ${future.length} future-or-undated (dropped malformed=${dropped}, past-date=${filteredOut})`,
  );

  return future;
}

function bytes(s: string): string {
  const n = s.length;
  if (n > 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)}mb`;
  if (n > 1024) return `${Math.round(n / 1024)}kb`;
  return `${n}b`;
}
