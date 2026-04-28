// civic.floyd_news_sync controller — POST /internal/floyd-news-sync/run
//
// Cron-triggered (and manually triggerable with the same CRON_SECRET).
// Discovers new news posts on the configured source URL, filters out
// past-dated events, dedupes against already-ingested rows, and creates
// one civic.announcement per new entry (auto-published, no admin
// review). Per-meeting failures are isolated; one bad post does not
// abort the run.
//
// Per Slice 13 design: synced announcements have `state.source` set so
// the event emitter routes the action_url to the external permalink.
// The feed-card click goes directly to floydcova.gov, not the internal
// /announcement/:id page.

import { Request, Response } from "express";
import {
  discoverNewsEntries,
  type FloydNewsEntry,
  type FloydNewsSyncConfig,
} from "../modules/civic.floyd_news_sync/index.js";
import {
  createProcess,
  getAllProcesses,
  saveProcessState,
} from "../services/processService.js";
import { emitEvent } from "../events/eventEmitter.js";
import { callClaude, DEFAULT_MODEL } from "../utils/anthropic.js";
import { fetchHtml } from "../utils/http.js";
import {
  emitAnnouncementResultPublished,
  type AnnouncementProcessContext,
  type AnnouncementProcessState,
  type AnnouncementSource,
} from "../modules/civic.announcement/index.js";

const DEFAULT_SOURCE_URL = "https://www.floydcova.gov/news";
const DEFAULT_MAX_PER_RUN = 3;
const CRON_ACTOR = "system:floyd-news-sync-cron";
const SYNCED_AUTHOR_ROLE = "Floyd County Government";

function requireCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7).trim();
  return token.length > 0 && token === secret;
}

function enabled(): boolean {
  // Default: enabled. Operator opts out via FLOYD_NEWS_SYNC_ENABLED=false
  // (e.g. while testing the cron in a preview environment without burning
  // through Anthropic credits).
  const v = process.env.FLOYD_NEWS_SYNC_ENABLED?.trim().toLowerCase();
  return v !== "false";
}

function maxPerRun(): number {
  const raw = process.env.FLOYD_NEWS_SYNC_MAX_PER_RUN?.trim();
  if (!raw) return DEFAULT_MAX_PER_RUN;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_MAX_PER_RUN;
  return Math.floor(n);
}

function modelName(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

function sourceUrl(): string {
  return process.env.FLOYD_NEWS_SOURCE_URL?.trim() || DEFAULT_SOURCE_URL;
}

function todayIsoLocal(): string {
  // Server-local YYYY-MM-DD. The Vercel function runs in UTC; for a
  // Virginia jurisdiction this can drift by ±1 day at the day boundary
  // but doesn't materially affect the filter (a post made within hours
  // of an event date is unlikely to be exactly on the boundary).
  return new Date().toISOString().slice(0, 10);
}

function announcementState(record: { state: Record<string, unknown> }): AnnouncementProcessState {
  return record.state as unknown as AnnouncementProcessState;
}

/**
 * Build the set of share_urls already ingested as civic.announcement
 * rows. Used for dedupe — one announcement per share_url, ever. Linear
 * scan over all announcement processes; fine at MVP scale.
 */
async function existingShareUrls(): Promise<Set<string>> {
  const all = await getAllProcesses();
  const out = new Set<string>();
  for (const p of all) {
    if (p.definition.type !== "civic.announcement") continue;
    const state = announcementState(p);
    const url = state?.source?.share_url;
    if (typeof url === "string" && url.length > 0) {
      out.add(url);
    }
  }
  return out;
}

export async function handleRunFloydNewsSync(
  req: Request,
  res: Response,
): Promise<void> {
  if (!requireCronSecret(req)) {
    res.status(401).json({ error: "Invalid or missing cron credential" });
    return;
  }

  if (!enabled()) {
    res.status(200).json({ skipped: true, reason: "floyd-news-sync disabled" });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({
      error:
        "ANTHROPIC_API_KEY must be set. Create a key at https://console.anthropic.com and add it to Vercel env vars.",
    });
    return;
  }

  const cfg: FloydNewsSyncConfig = {
    source_url: sourceUrl(),
    model: modelName(),
  };

  const started = Date.now();
  const today = todayIsoLocal();
  let discovered = 0;
  let created = 0;
  let skippedExisting = 0;
  let failed = 0;

  try {
    console.log(
      `[floyd-news-sync] run started source=${cfg.source_url} today=${today}`,
    );

    const entries: FloydNewsEntry[] = await discoverNewsEntries(
      cfg,
      { fetchHtml, callClaude },
      today,
    );
    discovered = entries.length;

    const existing = await existingShareUrls();
    const cap = maxPerRun();
    console.log(
      `[floyd-news-sync] processing — discovered=${discovered} existing=${existing.size} per_run_cap=${cap}`,
    );

    for (const entry of entries) {
      if (created >= cap) {
        console.log(
          `[floyd-news-sync] cap reached (${cap}); remaining new entries deferred to next run`,
        );
        break;
      }
      if (existing.has(entry.share_url)) {
        skippedExisting += 1;
        continue;
      }

      const meetingStart = Date.now();
      try {
        const source: AnnouncementSource = {
          origin: "floyd-news",
          share_url: entry.share_url,
          ingested_at: new Date().toISOString(),
        };

        const record = await createProcess({
          definition: { type: "civic.announcement", version: "0.1" },
          title: entry.title,
          // No body for synced announcements — the click goes external.
          // The descriptor's `description` is the body in the existing
          // pattern; pass an empty string and the announcement module's
          // `allowEmptyBody` branch (createAnnouncementState) accepts it
          // when a source is set.
          description: "",
          jurisdiction: "us-va-floyd",
          createdBy: CRON_ACTOR,
          state: {
            title: entry.title,
            body: "",
            author_id: CRON_ACTOR,
            author_role: SYNCED_AUTHOR_ROLE,
            links: [],
            image_url: entry.image_url,
            // Wix listing thumbnails don't ship with alt text; without
            // a real alt we render the image purely as decoration.
            // Empty string is fine — the announcement validator allows
            // null/empty alt and the public read model handles both.
            image_alt: null,
            source,
          },
        });

        // Auto-publish: announcements skip Phases 1-5 and go directly
        // to publication. The generic createProcess emitted a generic
        // civic.process.created; we also emit the module's richer
        // result_published so feed/digest pick it up.
        const state = announcementState(record);
        const ctx: AnnouncementProcessContext = {
          process_id: record.id,
          hub_id: record.hubId,
          jurisdiction: record.jurisdiction,
          emit: emitEvent,
        };
        await emitAnnouncementResultPublished(ctx, CRON_ACTOR, state);

        record.status = "finalized";
        await saveProcessState(record);

        console.log(
          `[floyd-news-sync] created process=${record.id} share_url=${entry.share_url} duration_ms=${Date.now() - meetingStart}`,
        );
        created += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        console.warn(
          `[floyd-news-sync] failed share_url=${entry.share_url} error=${msg} duration_ms=${Date.now() - meetingStart}`,
        );
        failed += 1;
      }
    }

    const duration_ms = Date.now() - started;
    console.log(
      `[floyd-news-sync] run complete discovered=${discovered} created=${created} skipped_existing=${skippedExisting} failed=${failed} duration_ms=${duration_ms}`,
    );
    res.status(200).json({
      discovered,
      created,
      skipped_existing: skippedExisting,
      failed,
      duration_ms,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    console.error("[floyd-news-sync] run failed:", err);
    res.status(500).json({ error: msg });
  }
}
