# TESTING.md — Civic Hub Test Coverage Tracker

Updated alongside HANDOFF.md after every session that adds or modifies features.

---

## Testing Principles

1. **Tests ship with the feature.** Every slice that adds or changes user-facing behavior must include corresponding tests before the slice is considered complete.
2. **Test behavior, not implementation.** Tests describe what a resident or admin experiences. They should survive refactors and only break when something is actually wrong.
3. **One flow per test, with a clear name.** Test names read like sentences: `"resident can cast a vote on an active process"`. When a test fails, the name alone tells you what's broken.
4. **Cover the sad paths.** Voting on a closed process, submitting with missing fields, double-voting, hitting admin routes without auth — these are the bugs that slip past visual checks.
5. **Seed data is infrastructure.** Deterministic fixtures shared across API and E2E tests. Treat them like code.

---

## Quick Start

```bash
cd civic-hub

# API integration tests (requires dev server running on :3000)
npm run test

# E2E browser tests (auto-starts backend + frontend if not running)
npm run test:e2e

# E2E with visible browser
npm run test:e2e:headed

# E2E with Playwright UI mode (interactive)
npm run test:e2e:ui

# Watch mode for API tests during development
npm run test:watch
```

---

## Two Test Layers

### API Integration Tests (Vitest)
Hit the Express backend directly via fetch, no browser. Fast, high coverage.

- **Location:** `civic-hub/tests/api/`
- **Run:** `npm run test`
- **Config:** `civic-hub/vitest.config.ts`
- **Helpers:** `civic-hub/tests/fixtures/helpers.ts`
- **Covers:** process CRUD, event feed, auth flow, proposals, search, health/discovery, cron endpoints

### E2E User Flow Tests (Playwright)
Open the real UI in Chromium and simulate resident interactions.

- **Location:** `civic-hub/tests/e2e/`
- **Run:** `npm run test:e2e`
- **Config:** `civic-hub/playwright.config.ts`
- **Covers:** critical user journeys — navigation, feed, votes, search
- **Note:** Each test dismisses the intro popup via localStorage before running.

---

## Flow Coverage Inventory

Each row tracks a user flow, which layer covers it, and which slice introduced it.

### Resident Flows

| Flow | API | E2E | Slice | Notes |
|------|-----|-----|-------|-------|
| View feed (announcements + events) | | :white_check_mark: | — | feed.spec.ts |
| Filter feed by type (All / Announcements / Votes) | | :white_check_mark: | — | feed.spec.ts (filter pills visible) |
| Navigate Feed <-> Votes via tab strip | | :white_check_mark: | 12.1 | navigation.spec.ts |
| Hamburger drawer shows all nav links | | :white_check_mark: | 12.3 | navigation.spec.ts |
| Click feed item to detail page | | :white_check_mark: | — | feed.spec.ts |
| View active vote details | | :white_check_mark: | — | votes.spec.ts (click card -> process) |
| Cast a vote on an active process | | | — | Needs test (requires auth in E2E) |
| Vote on a closed process (should fail) | | | — | Sad path — needs test |
| Double-vote prevention | | | — | Sad path — needs test |
| Submit a proposal | :white_check_mark: | | — | proposals.test.ts |
| View proposal detail | :white_check_mark: | | — | proposals.test.ts |
| Proposal requires auth | :white_check_mark: | | — | proposals.test.ts |
| Proposal requires residency | :white_check_mark: | | — | proposals.test.ts |
| View vote results | | | — | Needs test |
| View vote log | | | — | Needs test |
| Search processes and announcements | :white_check_mark: | :white_check_mark: | 10.5 | search.test.ts + search.spec.ts |
| View announcement detail | | | — | Needs test |
| View meeting summary | | | — | Needs test |
| Settings page renders | | | — | Needs test |
| Legal pages render (Privacy, Terms, CoC) | | :white_check_mark: | — | navigation.spec.ts |
| Feedback submission | | | — | Needs test |
| Intro popup shows on first visit | | | — | Needs test |
| Suggest-a-vote CTA visible on /votes | | :white_check_mark: | — | votes.spec.ts |
| Wordmark links to home | | :white_check_mark: | — | navigation.spec.ts |
| Mobile: sticky chrome (nav + tabs + pills) | | | 12.3 | Needs test (mobile viewport) |
| Mobile: image thumbnail layout | | | 12.3 | Needs test (mobile viewport) |
| Vote drafting: /votes/new renders path choice | | | A | Needs test |
| Vote drafting: brainstorm flow sends assistant message | | | A | Needs test |
| Vote drafting: form shows title, description, sources, duration | | | A | Needs test |
| Vote drafting: duration picker changes voting window | | | A | Needs test |
| Vote drafting: review triggers CoC check | | | A | Needs test |
| Vote drafting: submit creates + auto-activates vote | | | A | Needs test |
| Vote drafting: submit redirects to /process/:id | | | A | Needs test |
| /propose listing page shows proposals + CTA | | | B | Needs test |
| /propose/new renders path choice (brainstorm / write) | | | B | Needs test |
| Propose drafting: idea/concern toggle switches placeholders | | | B | Needs test |
| Propose drafting: form shows title, description, sources (no considerations) | | | B | Needs test |
| Propose drafting: review triggers CoC check | | | B | Needs test |
| Propose drafting: submit redirects to /propose | | | B | Needs test |
| Proposal detail: support button increments count, status stays open | | | B | Needs test |
| Proposal detail: no endorsement progress bar | | | B | Needs test |
| Proposals removed from Votes page listing | | | B | Needs test |
| Existing endorsed/converted proposals display with historical status | | | B | Needs test |
| Feed: generic fallback renders unknown event types | | | A | Needs test |

### Admin Flows

| Flow | API | E2E | Slice | Notes |
|------|-----|-----|-------|-------|
| Admin: approve/reject proposal | | | — | Needs test |
| Admin: publish vote results | | | — | Needs test |
| Admin: manage meeting summaries | | | — | Needs test |
| Admin: moderation actions | | | — | Needs test |
| Admin: hub settings | | | — | Needs test |
| Admin: post announcement | | | — | Needs test |

### API-Only Flows

| Flow | API | Slice | Notes |
|------|-----|-------|-------|
| GET /.well-known/civic.json returns discovery manifest | :white_check_mark: | — | health.test.ts |
| GET / returns endpoint directory | :white_check_mark: | — | health.test.ts |
| GET /health returns ok status | :white_check_mark: | — | health.test.ts |
| GET /process lists all processes | :white_check_mark: | — | processes.test.ts |
| GET /process/:id returns a single process | :white_check_mark: | — | processes.test.ts |
| GET /process/:id returns 404 for missing process | :white_check_mark: | — | processes.test.ts |
| GET /process/:id/state returns UI-friendly state | :white_check_mark: | — | processes.test.ts |
| GET /events returns events in wrapped response | :white_check_mark: | — | events.test.ts |
| Events conform to Civic Event Spec v0.1 | :white_check_mark: | — | events.test.ts |
| Events use canonical civic.* prefix | :white_check_mark: | — | events.test.ts |
| Events sorted descending by timestamp | :white_check_mark: | — | events.test.ts |
| GET /events?process_id=X filters by process | :white_check_mark: | — | events.test.ts |
| GET /events?event_type=X filters by type | :white_check_mark: | — | events.test.ts |
| POST /auth/request-code accepts email | :white_check_mark: | — | auth.test.ts |
| POST /auth/request-code rejects invalid email | :white_check_mark: | — | auth.test.ts |
| POST /auth/verify creates user + returns token | :white_check_mark: | — | auth.test.ts |
| POST /auth/verify rejects wrong code | :white_check_mark: | — | auth.test.ts |
| GET /auth/me returns user when authenticated | :white_check_mark: | — | auth.test.ts |
| GET /auth/me returns 401 without token | :white_check_mark: | — | auth.test.ts |
| POST /auth/residency affirms residency | :white_check_mark: | — | auth.test.ts |
| GET /proposals returns list | :white_check_mark: | — | proposals.test.ts |
| POST /proposals requires auth | :white_check_mark: | — | proposals.test.ts |
| POST /proposals requires residency | :white_check_mark: | — | proposals.test.ts |
| Resident can submit proposal | :white_check_mark: | — | proposals.test.ts |
| GET /proposals/:id returns detail | :white_check_mark: | — | proposals.test.ts |
| GET /search?q=X returns results | :white_check_mark: | — | search.test.ts |
| GET /search?q=nonexistent returns empty | :white_check_mark: | — | search.test.ts |
| Search results include process metadata | :white_check_mark: | — | search.test.ts |
| Cron: floyd-news-sync accepts GET, rejects POST | :white_check_mark: | — | crons.test.ts |
| Cron: digest accepts GET, rejects POST | :white_check_mark: | — | crons.test.ts |
| Cron: meeting-summary accepts GET, rejects POST | :white_check_mark: | — | crons.test.ts |
| Cron: admin-digest accepts GET, rejects POST | :white_check_mark: | — | crons.test.ts |
| Cron: missing auth returns 401 | :white_check_mark: | — | crons.test.ts |
| Cron: wrong auth returns 401 | :white_check_mark: | — | crons.test.ts |
| Process lifecycle: draft -> active -> closed -> finalized | | — | Needs test |
| Process registry dispatches to correct handler | | — | Needs test |
| POST /votes/drafts creates vote draft | | A | Needs test |
| GET /votes/drafts/:id returns draft with ownership check | | A | Needs test |
| PATCH /votes/drafts/:id validates duration range | | A | Needs test |
| POST /votes/drafts/:id/assistant returns vote-specific guidance | | A | Needs test |
| POST /votes/drafts/:id/review checks CoC for votes | | A | Needs test |
| POST /votes/drafts/:id/submit creates active vote process | | A | Needs test |

---

## How to Update This File

After each slice:

1. If the slice adds a new user flow, add a row to the appropriate table.
2. If you wrote tests for the flow, mark the API and/or E2E columns with :white_check_mark:.
3. If a flow exists but has no test yet, leave the columns blank and note "Needs test".
4. Flag any flows that were manually verified but not yet automated.

The goal: before any push to `main`, every row in this table should have at least one checkmark.

---

## Test Infrastructure Notes

- **Auth in tests:** Uses `CIVIC_DEMO_BYPASS_CODE=000000` (set in `.env`). Test helpers sign in by calling `/auth/request-code` then `/auth/verify` with the bypass code.
- **Intro popup in E2E:** Each test sets `localStorage.setItem("seen_intro_popup", "true")` before interacting with the page to prevent the intro dialog from blocking clicks.
- **File parallelism disabled:** Vitest runs test files sequentially (`fileParallelism: false`) because they share a dev server and database.
- **Playwright auto-starts servers:** The Playwright config includes `webServer` entries for both the backend (:3000) and frontend (:5173). If they're already running, it reuses them.

---

*Last updated: 2026-05-23*
