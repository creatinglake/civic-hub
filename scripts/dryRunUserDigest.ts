// Dry-run: render the user-facing digest HTML for a stub set of items
// covering ALL four digest kinds (announcement, vote open, vote
// results, meeting summary), so we can inspect the markup without
// sending an email.
//
// Run with: node --env-file=.env --import tsx scripts/dryRunUserDigest.ts

import {
  assembleDigestForUser,
  type DigestEvent,
  type DigestHubContext,
} from "../src/modules/civic.digest/index.js";

const hub: DigestHubContext = {
  hub_name: "Floyd Civic Hub",
  ui_base_url: "https://floyd.civic.social",
  postal_address: "Floyd, VA",
  unsubscribe_url: "https://floyd.civic.social/unsubscribe/digest?token=stub",
  manage_subscriptions_url: "https://floyd.civic.social/settings",
};

const since = "2026-04-28T13:00:00Z";

const stubEvents: DigestEvent[] = [
  // 1. announcement (civic.announcement → result_published)
  {
    id: "evt_001",
    event_type: "civic.process.result_published",
    timestamp: "2026-04-29T02:18:27Z",
    process_id: "proc_announcement",
    action_url: "https://floyd.civic.social/announcement/proc_announcement",
    data: {
      announcement: {
        id: "proc_announcement",
        title: "Lawn Care Bid",
        author_role: "Floyd County Government",
      },
    },
  },
  // 2. vote open (civic.vote → started)
  {
    id: "evt_002",
    event_type: "civic.process.started",
    timestamp: "2026-04-29T03:00:00Z",
    process_id: "proc_vote",
    action_url: "https://floyd.civic.social/process/proc_vote",
    data: {
      vote: { title: "Add More Secure Dumpster (Green Box) Sites" },
    },
  },
  // 3. vote results (civic.vote_results → result_published)
  {
    id: "evt_003",
    event_type: "civic.process.result_published",
    timestamp: "2026-04-29T04:00:00Z",
    process_id: "proc_results",
    action_url: "https://floyd.civic.social/vote-results/proc_results",
    data: {
      results_id: "proc_results",
      title: "Vote results: Flock cameras",
    },
  },
  // 4. meeting summary (civic.meeting_summary → result_published)
  {
    id: "evt_004",
    event_type: "civic.process.result_published",
    timestamp: "2026-04-29T05:00:00Z",
    process_id: "proc_meeting",
    action_url: "https://floyd.civic.social/meeting-summary/proc_meeting",
    data: {
      meeting_summary: {
        meeting_title: "BOS Meeting — April 21",
      },
      summary_id: "proc_meeting",
    },
  },
];

const result = assembleDigestForUser({
  user: {
    id: "user_test",
    email: "test@example.com",
    created_at: "2026-04-01T00:00:00Z",
    last_digest_sent_at: since,
  },
  events: stubEvents,
  hub,
  since,
  process_titles: {
    proc_announcement: "Lawn Care Bid",
    proc_vote: "Add More Secure Dumpster (Green Box) Sites",
    proc_results: "Vote results: Flock cameras",
    proc_meeting: "BOS Meeting — April 21",
  },
  process_thumbnails: {},
});

if (!result) {
  console.log("(empty digest — no items)");
  process.exit(0);
}

console.log("--- subject ---");
console.log(result.subject);
console.log("");
console.log("--- summary check: anchors per row ---");
const html = result.html;
const rowMatches = html.match(/<li[^>]*>[\s\S]*?<\/li>/g) ?? [];
console.log(`Total rows: ${rowMatches.length}`);
rowMatches.forEach((row, i) => {
  const wrapAnchor = row.match(/<a href="([^"]+)" style="display:block;text-decoration:none;color:inherit;"/);
  const innerAnchorCount = (row.match(/<a /g) ?? []).length;
  const hasChevron = row.includes("&rsaquo;");
  const pillMatch = row.match(/border-radius:9999px;">([^<]+)<\/span>/);
  console.log(
    `  Row ${i + 1}: wrap=${wrapAnchor ? "yes" : "NO"}, anchors=${innerAnchorCount}, chevron=${hasChevron ? "yes" : "NO"}, pill="${pillMatch?.[1] ?? "?"}"`,
  );
});
