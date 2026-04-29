// Dry-run: build the admin digest payload + render the email, but
// don't dispatch. Used to verify Slice 16 wiring against dev
// Supabase without needing CRON_SECRET locally.
//
// Run with:  node --env-file=.env --import tsx scripts/dryRunAdminDigest.ts
//
// Pass --stub to render a non-empty payload regardless of the live DB
// state (useful to verify the email layout when dev queues are empty).

import {
  buildAdminDigest,
  renderAdminDigestEmail,
  type AdminDigestPayload,
} from "../src/modules/civic.admin_digest/index.js";

function stubPayload(): AdminDigestPayload {
  const now = new Date().toISOString();
  return {
    hub_name: "Floyd Civic Hub",
    generated_at: now,
    proposals: {
      count: 2,
      items: [
        { id: "prop_001", title: "Sidewalks on Main Street", created_at: now },
        { id: "prop_002", title: "Dog park near the courthouse", created_at: now },
      ],
      panel_url: "https://example.civic.social/admin/proposals",
    },
    vote_results: {
      count: 1,
      items: [
        { id: "vr_001", title: "Vote results: Flock cameras (April)", created_at: now },
      ],
      panel_url: "https://example.civic.social/admin/vote-results",
    },
    meeting_summaries: {
      count: 7,
      items: [
        { id: "ms_001", title: "BOS Meeting — April 21", created_at: now },
        { id: "ms_002", title: "BOS Meeting — April 14", created_at: now },
        { id: "ms_003", title: "Planning Commission — April 18", created_at: now },
        { id: "ms_004", title: "Budget Workshop — April 10", created_at: now },
        { id: "ms_005", title: "BOS Meeting — April 7", created_at: now },
      ],
      panel_url: "https://example.civic.social/admin/meeting-summaries",
    },
    empty: false,
  };
}

async function main() {
  const useStub = process.argv.includes("--stub");
  const payload = useStub ? stubPayload() : await buildAdminDigest();
  console.log("--- payload ---");
  console.log(JSON.stringify(payload, null, 2));
  console.log("");
  if (payload.empty) {
    console.log("(empty — would skip send in production)");
    return;
  }
  const { subject, text } = renderAdminDigestEmail(payload);
  console.log("--- subject ---");
  console.log(subject);
  console.log("");
  console.log("--- text body ---");
  console.log(text);
}

main().catch((err) => {
  console.error("dry-run failed:", err);
  process.exit(1);
});
