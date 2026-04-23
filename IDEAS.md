# Ideas — Civic Hub Future Capabilities

Long-horizon thinking that isn't yet ready to become a GitHub issue. Use this
file for fuzzy ideas, exploratory features, and "what if…" thinking.

When an idea crystallizes into well-scoped, actionable work, **graduate it to
a GitHub Issue** (and optionally leave a stub here pointing at the issue, or
delete the entry).

**How this fits with the other tracking files:**

- **`HANDOFF.md`** (repo root of `Civic-Social-Mono`) — session-by-session
  build log. Each slice has short-term follow-ups at the bottom.
- **GitHub Issues** (on `creatinglake/civic-hub`) — concrete, actionable work
  items. Things you'd hand to a collaborator.
- **`IDEAS.md`** (this file, in `civic-hub`) — fuzzy, long-horizon, or
  cross-cutting thinking.

---

## Protocol / Federation

- ActivityPub federation — inbox/outbox for cross-hub event distribution
  (Phase 3+ per CLAUDE.md).
- DID-based identity and verifiable credentials (Phase 2).
- Event signing for cryptographic provenance across federated hubs.
- Credential-scoped visibility (e.g. "only verified Floyd residents can see
  this event / vote").
- Cross-hub event subscriptions — a hub can subscribe to another hub's feed
  filtered by jurisdiction or process type.

## Process Types (Plugin Model)

The process registry already supports adding new types without changing core
code. Ideas for process plugins worth exploring:

- `civic.petition` — signature-collection process with a support threshold
  and a public outcome.
- ~~`civic.announcement` — non-interactive news posts that surface in the feed
  but don't accept actions.~~ Shipped in Slice 4 (2026-04-22).
- `civic.deliberation` — structured discussion with framing prompts, before a
  vote opens.
- `civic.budget` — participatory budgeting (allocate a fixed pool across
  projects).
- `civic.townhall` — scheduled real-time event with RSVP and post-event notes.

## UI / UX

- **Theme uploader.** Hub operators upload a theme file (colors, fonts, logo,
  banner) that overrides the `:root` tokens defined in
  `ui/src/styles/theme.css`. The token architecture is already in place;
  what's missing is the upload UI and the storage model.
- **Feed filter / search UI.** The `Feed` component already accepts a
  `filter` prop as an extension point, so this is additive.
- **Live relative timestamps.** Make "5 days ago" tick without a reload.
- **Visual harmonization** between `civic-hub/ui/` and `citizen-dashboard/`.
  Potentially via a shared token package.
- **Process-type-specific feed posts.** When petitions and announcements
  land, the `eventToPost()` switch in `FeedPost.tsx` needs new branches for
  their post formats.

## Infrastructure / Ops

- Monitoring / error reporting (e.g. Sentry) wired to Vercel.
- Server-side pagination on `GET /events` once the event store outgrows
  client-side slicing.
- Event archival / compaction strategy for long-lived hubs.

## Backend / Spec alignment

- Carry the process title in `civic.process.result_published` event data, so
  federated consumers can render result posts without calling back to the
  origin hub. Briefs already carry it; votes still don't.
- Theme consolidation — migrate legacy `--text-color` / `--primary-color`
  vars in `ui/src/index.css` to the semantic tokens in
  `ui/src/styles/theme.css`.
- Slice 3.5: populate `BriefContent.comments` from the `civic.input`
  stream at brief generation time. Today the array is empty until admin
  manually enters entries during review. The generator in
  `civic-hub/src/modules/civic.brief/service.ts` (`generateBriefContent`)
  should accept the list of community-input bodies and seed
  `content.comments` with sanitized entries so the admin review starts warm.

## Governance / Community

- Moderation tooling — admin review queue, takedown log, appeal flow.
- Jurisdiction directory — discover hubs by geography.
- Politician / official profiles tied to jurisdictions, with verified
  channels for posting responses to community votes.
- Credential issuance (residency, voter registration) as civic-issued VCs.
- **User-record roles (replaces env-var email lists).** Today admin and
  Board roles come from `CIVIC_ADMIN_EMAILS` / `CIVIC_BOARD_EMAILS`
  env vars. For the pilot that's fine — the lists are tiny. As the hub
  scales or federates, migrate to a per-user role column in the users
  table so role assignment is a DB operation (admin-editable UI) and
  doesn't require a redeploy per change.
- **Announcement retraction.** Slice 4 supports edits but not deletion
  or retraction. An announcement that was sent in error may need to be
  withdrawn transparently (emit `civic.process.retracted`, keep the
  record visible but marked "retracted", preserve edit history). Spec
  would need a new canonical event type for this.

## Protocol / Federation (further)

- **Informational `process_kind`.** Spec §5 assumes all processes
  implement Phases 0–6 with meaningful civic activity in each. Slice 4's
  `civic.announcement` skips Phases 1–5 because they don't correspond to
  anything real for an instant-publish informational post. Worth
  proposing a spec extension that formalizes three process kinds:
  participation-driven (civic.vote, civic.petition),
  derivative (civic.brief), and informational (civic.announcement), each
  with its own phase-compliance rules. Makes conformance checks clearer
  and helps federated consumers interpret incoming process descriptors.

## Observability of civic impact

- Track and surface how vote results flow back into local government
  decisions — feedback loop for "did this vote actually change anything?"
- Public audit log of official responses tied to specific votes.

---

## Log of ideas that graduated

When an idea here becomes a GitHub issue, move the entry down here with a
link. Keeps a paper trail of what was fuzzy thinking that turned real.

- Separate Supabase projects for preview and production → [#2](https://github.com/creatinglake/civic-hub/issues/2)
