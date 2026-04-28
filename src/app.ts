// Express app — exported for use by both the dev server (index.ts)
// and the Vercel serverless function (api/index.ts).
//
// This file sets up all middleware, routes, and auto-seeding.
// It does NOT call app.listen() — that's the caller's job.

import express from "express";
import processRoutes from "./routes/processRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import discoveryRoutes from "./routes/discoveryRoutes.js";
import debugRoutes from "./routes/debugRoutes.js";
import inputRoutes from "./routes/inputRoutes.js";
import proposalRoutes from "./routes/proposalRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import authRoutes from "./routes/authRoutes.js";
import voteLogRoutes from "./routes/voteLogRoutes.js";
import voteResultsRoutes from "./routes/voteResultsRoutes.js";
import announcementRoutes from "./routes/announcementRoutes.js";
import uploadRoutes from "./routes/uploadRoutes.js";
import linkPreviewRoutes from "./routes/linkPreviewRoutes.js";
import searchRoutes from "./routes/searchRoutes.js";
import meetingSummaryRoutes, {
  meetingSummaryCronRouter,
} from "./routes/meetingSummaryRoutes.js";
import { floydNewsSyncCronRouter } from "./routes/floydNewsSyncRoutes.js";
import {
  digestCronRouter,
  digestUnsubscribeRouter,
  userSettingsRouter,
} from "./routes/digestRoutes.js";
import { handleListAnnouncements } from "./controllers/announcementController.js";
import { ensureSeeded } from "./debug/autoSeed.js";
import { pingDb } from "./db/client.js";

const app = express();

// CORS — allowed origins come from CIVIC_ALLOWED_ORIGINS (comma-separated).
// If the env var is unset and NODE_ENV !== "production", we default to "*"
// for dev convenience. In production, an unset var is a hard failure.
const parsedOrigins = (process.env.CIVIC_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter((o) => o.length > 0);

const isProd = process.env.NODE_ENV === "production";

if (isProd && parsedOrigins.length === 0) {
  throw new Error(
    "CIVIC_ALLOWED_ORIGINS must be set in production (comma-separated list of origins)",
  );
}

const allowedOrigins = new Set(parsedOrigins);
const allowAnyOrigin = !isProd && parsedOrigins.length === 0;

app.use((req, res, next) => {
  const origin = req.headers.origin as string | undefined;
  if (allowAnyOrigin) {
    res.header("Access-Control-Allow-Origin", "*");
  } else if (origin && allowedOrigins.has(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
  }
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.header("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
});

app.use(express.json());

// Ensure seed data exists on every request (handles Vercel multi-instance cold starts)
app.use(ensureSeeded as express.RequestHandler);

// Auth endpoints — email-based authentication
app.use("/auth", authRoutes);

// --- Internal control surfaces ---
// Process endpoints are internal. External systems should use /events.
app.use("/process", processRoutes);
app.use("/process", inputRoutes);

// Proposal endpoints — user-facing proposal submission and endorsement
app.use("/proposals", proposalRoutes);

// Admin endpoints — proposal review and conversion to votes
app.use("/admin", adminRoutes);

// Vote log and receipt verification
app.use("/votes", voteLogRoutes);

// Vote results — public read of published vote-results pages.
// Renamed from /brief in Slice 8.5.
app.use("/vote-results", voteResultsRoutes);

// Legacy redirect: any HTTP client that calls the old /brief/:id path
// (direct curl, scraper, etc.) gets a 301 to the new location. Browser
// navigation from old event action_urls is handled by the SPA via
// React Router (see ui/src/App.tsx) because Vercel rewrites all
// non-/api requests to index.html before they ever reach this Express
// app in production.
app.get("/brief/:id", (req, res) => {
  res.redirect(301, `/vote-results/${req.params.id}`);
});

// Board / Admin announcements — post, edit, read one
app.use("/announcement", announcementRoutes);
// Public list — separate path so it doesn't collide with /announcement/:id
app.get("/announcements", handleListAnnouncements);

// Slice 9 — image upload + link previews. The upload endpoint is
// authenticated (requireAnnouncementPoster) and accepts multipart bodies;
// the link-preview endpoint is public and lightly rate-limited.
app.use("/upload", uploadRoutes);
app.use("/link-preview", linkPreviewRoutes);

// Slice 10.5 — public full-text search across all process types.
// Backed by Postgres FTS via the search_processes RPC (see
// supabase/migrations/20260427200000_add_search_doc.sql).
app.use("/search", searchRoutes);

// Meeting summaries (Slice 6):
//   /meeting-summary/:id    — public read of published summaries
app.use("/meeting-summary", meetingSummaryRoutes);

// Digest (Slice 5) + Meeting summary (Slice 6) + Floyd-news-sync
// (Slice 13) crons all mount here. Vercel Cron POSTs with the
// CRON_SECRET bearer, auto-injected.
//   /internal/digest/run
//   /internal/meeting-summary/run
//   /internal/floyd-news-sync/run
app.use("/internal", digestCronRouter);
app.use("/internal", meetingSummaryCronRouter);
app.use("/internal", floydNewsSyncCronRouter);
app.use("/unsubscribe", digestUnsubscribeRouter);
app.use("/user/settings", userSettingsRouter);

// --- Primary public interfaces ---
// Events are the PRIMARY public interface of the hub.
// All external systems (feeds, dashboards, federation) should rely on events.
app.use("/events", eventRoutes);

// Discovery manifest
app.use("/.well-known", discoveryRoutes);

// Debug / seed (development only)
app.use("/debug", debugRoutes);

// Root — overview of available endpoints
app.get("/", (_req, res) => {
  res.json({
    name: "Civic Hub",
    version: "0.1.0",
    description: "Reference implementation of a Civic Hub backend",
    endpoints: {
      "GET /process": "List all processes (UI read layer)",
      "GET /process/:id/state": "Get UI-friendly process state with tally",
      "POST /process": "Create a new process (internal)",
      "GET /process/:id": "Get a process by ID (internal)",
      "POST /process/:id/action": "Execute an action on a process (internal)",
      "POST /process/:id/input": "Submit community input for a process",
      "GET /process/:id/input": "Get all community inputs for a process",
      "POST /proposals": "Submit a new civic proposal",
      "GET /proposals": "List proposals (optional ?status= filter)",
      "GET /proposals/:id": "Get proposal detail (optional ?actor= for support check)",
      "POST /proposals/:id/support": "Endorse a proposal",
      "GET /admin/proposals": "List proposals for admin review",
      "GET /admin/proposals/:id": "Get full proposal detail for admin",
      "POST /admin/proposals/:id/convert": "Convert endorsed proposal to civic.vote",
      "POST /admin/proposals/:id/archive": "Archive a proposal",
      "POST /auth/request-code": "Request email verification code",
      "POST /auth/verify": "Verify code and get session token",
      "POST /auth/residency": "Affirm Floyd County residency (requires auth)",
      "GET /auth/me": "Get current authenticated user",
      "POST /auth/logout": "Destroy session",
      "GET /votes/:id/log": "Public vote audit log (available after vote closes)",
      "GET /votes/:id/verify?receipt=X": "Verify a vote receipt",
      "GET /admin/vote-results": "List vote results for admin review (optional ?status=)",
      "GET /admin/vote-results/:id": "Get full vote-results detail for admin",
      "PATCH /admin/vote-results/:id": "Edit comments/notes (pending only)",
      "POST /admin/vote-results/:id/approve": "Approve: email Board + publish to feed",
      "GET /vote-results/:id": "Public read of a published vote-results page",
      "GET /brief/:id": "Legacy → 301 redirect to /vote-results/:id",
      "POST /announcement": "Post a Board announcement (Board or admin)",
      "PATCH /announcement/:id": "Edit an announcement (author only, or any admin)",
      "GET /announcement/:id": "Public read of an announcement",
      "GET /announcements": "List announcements, newest first (optional ?limit=N)",
      "POST /upload/post-image": "Upload a featured image (multipart, authed)",
      "GET /link-preview?url=X": "Fetch (cached) OpenGraph preview for a URL",
      "GET /search?q=X": "Full-text search across all process types (public)",
      "POST /internal/digest/run": "Cron-triggered daily email digest (CRON_SECRET bearer)",
      "GET /unsubscribe/digest?token=X": "Unsubscribe from the daily digest",
      "PATCH /user/settings/digest": "Toggle digest subscription (authed)",
      "POST /internal/meeting-summary/run": "Cron-triggered meeting discovery + summarization (CRON_SECRET bearer)",
      "POST /internal/floyd-news-sync/run": "Cron-triggered Floyd news/announcement sync (CRON_SECRET bearer)",
      "GET /admin/meeting-summaries": "List meeting summaries for admin review (optional ?status=)",
      "GET /admin/meeting-summaries/:id": "Get full meeting summary detail for admin",
      "PATCH /admin/meeting-summaries/:id": "Edit meeting summary blocks/notes (pending only)",
      "POST /admin/meeting-summaries/:id/approve": "Approve and publish a meeting summary",
      "GET /meeting-summary/:id": "Public read of a published meeting summary",
      "GET /events": "List all events (primary public interface)",
      "GET /events?process_id=X": "Filter events by process",
      "GET /events?type=X": "Filter events by type (e.g., civic.process.vote_submitted)",
      "GET /events?process_id=X&type=Y": "Combine filters",
      "GET /events?pretty=true": "Pretty-print event output",
      "GET /.well-known/civic.json": "Discovery manifest",
      "GET /debug/seed": "Seed sample data (dev only)",
      "GET /health": "Health check",
    },
  });
});

// Health check — includes a DB ping so you can verify Supabase connectivity
app.get("/health", async (_req, res) => {
  const db = await pingDb();
  res.status(db.ok ? 200 : 503).json({
    status: db.ok ? "ok" : "degraded",
    db,
    timestamp: new Date().toISOString(),
  });
});

// Auto-seed is triggered by the `ensureSeeded` middleware on first request,
// and is gated behind CIVIC_ALLOW_SEED so it never runs in production.

export default app;
