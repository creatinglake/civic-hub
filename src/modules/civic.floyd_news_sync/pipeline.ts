// civic.floyd_news_sync — orchestration pipeline
//
// Fetches the configured RSS feed, parses it, and filters by date.
// Returns the list of entries the controller should consider
// ingesting (further deduped by share_url against existing rows).
//
// No Claude usage on this path — RSS XML is structured. Faster, free,
// and removes a hallucination surface area.

import type { FloydNewsEntry, FloydNewsSyncConfig } from "./models.js";
import { isFutureOrUndated, parseRssFeed } from "./connector.js";

export type FetchTextFn = (url: string) => Promise<string>;

export interface DiscoverDeps {
  /**
   * Fetches the RSS feed body as text. Production wires this up to
   * civic-hub/src/utils/http.ts::fetchText (a thin wrapper over
   * `fetch` with timeout + user-agent). Tests inject a stub.
   */
  fetchText: FetchTextFn;
}

/**
 * Fetch + parse + date-filter. Returns entries ready for dedupe and
 * ingestion. Logs run-shape metrics (raw count, valid count,
 * future-or-undated count) so the Vercel logs read as a clear summary
 * even when nothing is created.
 */
export async function discoverNewsEntries(
  cfg: FloydNewsSyncConfig,
  deps: DiscoverDeps,
  today_iso: string,
): Promise<FloydNewsEntry[]> {
  const rawXml = await deps.fetchText(cfg.source_url);
  console.log(
    `[floyd-news-sync] fetched feed url=${cfg.source_url} bytes=${rawXml.length}`,
  );

  const parsed = parseRssFeed(rawXml);
  const future = parsed.filter((e) => isFutureOrUndated(e, today_iso));

  console.log(
    `[floyd-news-sync] parsed ${parsed.length} valid entries, ${future.length} future-or-undated (filtered out ${parsed.length - future.length} past-date)`,
  );

  return future;
}
