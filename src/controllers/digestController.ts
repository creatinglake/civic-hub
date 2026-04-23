// Digest controllers — three HTTP surfaces:
//
//   POST /internal/digest/run
//     Cron-triggered. Iterates every subscribed user, assembles a
//     per-user digest over their "since" window, sends via Resend
//     (utils/email). Updates last_digest_sent_at only on a successful
//     send. Empty digests are skipped silently — no email, no cursor
//     update.
//
//   GET /unsubscribe/digest?token=…
//     No auth. Verifies the HMAC-signed token, flips
//     digest_subscribed to false, returns a simple HTML confirmation.
//
//   PATCH /user/settings/digest
//     Authed (requireAuth). Flips the subscription flag for the
//     currently authenticated user (the settings-page toggle).
//
// Slice 5.

import { Request, Response } from "express";
import { getEventsSince } from "../events/eventStore.js";
import type { CivicEvent } from "../models/event.js";
import { getAllProcesses } from "../services/processService.js";
import {
  assembleDigestForUser,
  buildUnsubscribeUrl,
  verifyUnsubscribeToken,
  type DigestEvent,
  type DigestHubContext,
} from "../modules/civic.digest/index.js";
import {
  listSubscribedUsers,
  markDigestSent,
  setDigestSubscription,
  getUser,
} from "../modules/civic.auth/index.js";
import { sendEmail } from "../utils/email.js";
import { baseUrl, uiBaseUrl } from "../utils/baseUrl.js";
import { getAuthUser } from "../middleware/auth.js";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const HUB_NAME_FALLBACK = "Floyd Civic Hub";

function hubName(): string {
  return process.env.HUB_NAME?.trim() || HUB_NAME_FALLBACK;
}

function postalAddress(): string {
  return (
    process.env.HUB_POSTAL_ADDRESS?.trim() ||
    "Floyd, VA"
  );
}

function digestEnabled(): boolean {
  // Default to true. Only "false" (case-insensitive) disables.
  const v = process.env.DIGEST_ENABLED?.trim().toLowerCase();
  return v !== "false";
}

function requireCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7).trim();
  // Constant-time compare is overkill for this shared secret; standard
  // compare is acceptable for a cron-gate credential that isn't
  // user-chosen and can't be probed for partial matches in this code path.
  return token.length > 0 && token === secret;
}

function clampSince(user: {
  created_at: string;
  last_digest_sent_at: string | null;
}): string {
  const now = Date.now();
  const floor = new Date(now - THIRTY_DAYS_MS).toISOString();
  const anchor = user.last_digest_sent_at ?? user.created_at;
  return anchor < floor ? floor : anchor;
}

function toDigestEvent(e: CivicEvent): DigestEvent {
  return {
    id: e.id,
    event_type: e.event_type,
    timestamp: e.timestamp,
    process_id: e.process_id,
    action_url: e.action_url,
    data: e.data,
  };
}

// --- POST /internal/digest/run ---------------------------------------------

/**
 * Cron endpoint. Protected by CRON_SECRET bearer auth (Vercel Cron auto-
 * injects this header). Idempotent only in the sense that re-running
 * before last_digest_sent_at has been updated will re-send the same
 * events — but under normal operation a day passes between runs, so the
 * window shifts.
 */
export async function handleRunDigest(
  req: Request,
  res: Response,
): Promise<void> {
  if (!requireCronSecret(req)) {
    res.status(401).json({ error: "Invalid or missing cron credential" });
    return;
  }

  if (!digestEnabled()) {
    res.status(200).json({ skipped: true, reason: "digest disabled" });
    return;
  }

  const started = Date.now();
  const secret = process.env.DIGEST_UNSUBSCRIBE_SECRET;
  if (!secret || secret.length < 16) {
    res.status(500).json({
      error:
        "DIGEST_UNSUBSCRIBE_SECRET must be set and >= 16 characters for the digest cron to emit valid unsubscribe links.",
    });
    return;
  }

  const apiBase = baseUrl();
  const uiBase = uiBaseUrl();

  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  try {
    const users = await listSubscribedUsers();

    // Pull the earliest cursor across the whole subscribed set so we
    // query the event store once, then filter in-memory per user. This
    // keeps the cron's DB fan-out bounded as the user count grows.
    const earliest = users.reduce<string>((acc, u) => {
      const since = clampSince(u);
      return since < acc ? since : acc;
    }, new Date().toISOString());

    const allRecent =
      users.length === 0 ? [] : await getEventsSince(earliest);

    // One-shot lookup of process_id → title. civic.vote and civic.brief
    // events don't carry the title inline; the module uses this as a
    // fallback when its own payload doesn't have one. We fetch every
    // process once per cron run (cheap for MVP scale) instead of per
    // user or per event.
    const processTitles: Record<string, string> = {};
    if (users.length > 0) {
      try {
        const allProcesses = await getAllProcesses();
        for (const p of allProcesses) {
          processTitles[p.id] = p.title;
        }
      } catch (err) {
        // Non-fatal: fall back to generic labels in the digest. The
        // batch continues.
        const message = err instanceof Error ? err.message : "unknown error";
        console.warn(`[digest] title lookup failed: ${message}`);
      }
    }

    for (const user of users) {
      processed += 1;
      try {
        const since = clampSince(user);
        const windowEvents: DigestEvent[] = [];
        for (const e of allRecent) {
          if (e.timestamp > since) windowEvents.push(toDigestEvent(e));
        }

        const hub: DigestHubContext = {
          hub_name: hubName(),
          ui_base_url: uiBase,
          postal_address: postalAddress(),
          unsubscribe_url: buildUnsubscribeUrl({
            userId: user.id,
            apiBaseUrl: apiBase,
            secret,
          }),
          manage_subscriptions_url: `${uiBase}/settings`,
        };

        const digest = assembleDigestForUser({
          user: {
            id: user.id,
            email: user.email,
            created_at: user.created_at,
            last_digest_sent_at: user.last_digest_sent_at,
          },
          events: windowEvents,
          hub,
          since,
          process_titles: processTitles,
        });

        if (!digest) {
          console.log(
            `[digest] user=${user.id} events=0 sent=false reason=empty`,
          );
          skipped += 1;
          continue;
        }

        const result = await sendEmail({
          to: digest.to,
          subject: digest.subject,
          html: digest.html,
          text: digest.text,
        });

        if (!result.sent) {
          console.warn(
            `[digest] user=${user.id} events=${digest.item_count} sent=false error=${result.error ?? "unknown"}`,
          );
          failed += 1;
          continue;
        }

        await markDigestSent(user.id, new Date().toISOString());
        console.log(
          `[digest] user=${user.id} events=${digest.item_count} sent=true resend_id=${result.id ?? "?"}`,
        );
        sent += 1;
      } catch (err) {
        // One user's failure must not abort the batch.
        const message = err instanceof Error ? err.message : "unknown error";
        console.warn(`[digest] user=${user.id} sent=false error=${message}`);
        failed += 1;
      }
    }

    res.status(200).json({
      processed_users: processed,
      sent_count: sent,
      skipped_count: skipped,
      failed_count: failed,
      duration_ms: Date.now() - started,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[digest] batch error: ${message}`);
    res.status(500).json({
      error: message,
      processed_users: processed,
      sent_count: sent,
      skipped_count: skipped,
      failed_count: failed,
      duration_ms: Date.now() - started,
    });
  }
}

// --- GET /unsubscribe/digest?token=… ---------------------------------------

function renderUnsubscribePage(opts: {
  title: string;
  heading: string;
  body: string;
  error?: boolean;
}): string {
  const color = opts.error ? "#b91c1c" : "#1e3a5f";
  const ui = uiBaseUrl();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
  <style>
    body { margin: 0; padding: 0; background: #f5f5f5; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; }
    .card { max-width: 480px; margin: 80px auto; background: #ffffff; padding: 32px 28px; border-radius: 8px; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
    h1 { font-size: 22px; color: ${color}; margin: 0 0 12px; }
    p { font-size: 15px; line-height: 1.5; margin: 0 0 12px; color: #333; }
    a { color: #2c7be5; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(opts.heading)}</h1>
    <p>${opts.body}</p>
    <p><a href="${escapeHtml(ui)}">Return to ${escapeHtml(hubName())}</a></p>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function handleUnsubscribeDigest(
  req: Request,
  res: Response,
): Promise<void> {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  const secret = process.env.DIGEST_UNSUBSCRIBE_SECRET;

  if (!secret || secret.length < 16) {
    res.status(500).type("html").send(
      renderUnsubscribePage({
        title: "Unsubscribe unavailable",
        heading: "Unsubscribe unavailable",
        body: "This hub isn't configured to process unsubscribe links right now. Please contact the hub operator.",
        error: true,
      }),
    );
    return;
  }

  const userId = verifyUnsubscribeToken(token, secret);
  if (!userId) {
    res.status(400).type("html").send(
      renderUnsubscribePage({
        title: "Invalid unsubscribe link",
        heading: "This link is invalid",
        body:
          "This unsubscribe link is invalid or was signed by a key that's no longer valid. " +
          `Sign in and visit <a href="${escapeHtml(uiBaseUrl())}/settings">Settings</a> to manage your subscription.`,
        error: true,
      }),
    );
    return;
  }

  try {
    const user = await getUser(userId);
    if (!user) {
      res.status(404).type("html").send(
        renderUnsubscribePage({
          title: "Account not found",
          heading: "Account not found",
          body:
            "We couldn't find an account matching this unsubscribe link. " +
            "The account may have been deleted.",
          error: true,
        }),
      );
      return;
    }

    await setDigestSubscription(userId, false);
    console.log(`[digest] unsubscribed user=${userId}`);

    res.status(200).type("html").send(
      renderUnsubscribePage({
        title: "Unsubscribed",
        heading: "You've been unsubscribed",
        body:
          `You will no longer receive the daily email digest from ${escapeHtml(hubName())}. ` +
          `You can re-subscribe any time from the <a href="${escapeHtml(uiBaseUrl())}/settings">Settings</a> page.`,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error(`[digest] unsubscribe failed for user=${userId}: ${message}`);
    res.status(500).type("html").send(
      renderUnsubscribePage({
        title: "Unsubscribe failed",
        heading: "Something went wrong",
        body:
          "We couldn't process your unsubscribe just now. Please try again in a few minutes, or sign in and visit Settings.",
        error: true,
      }),
    );
  }
}

// --- PATCH /user/settings/digest -------------------------------------------

export async function handlePatchDigestSubscription(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const user = getAuthUser(res);
    const body = (req.body ?? {}) as { subscribed?: unknown };
    if (typeof body.subscribed !== "boolean") {
      res.status(400).json({
        error: "Body must include { subscribed: boolean }",
      });
      return;
    }
    const updated = await setDigestSubscription(user.id, body.subscribed);
    res.json({
      digest_subscribed: updated.digest_subscribed,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
