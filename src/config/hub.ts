// Single source of truth for this deployment's hub identity + jurisdiction.
// Previously "civic-hub-local" / "local" were hardcoded in ~9 files, so prod
// Floyd events carried hub_id "civic-hub-local", and the discovery manifest
// read CIVIC_JURISDICTION while emitters ignored it (inconsistent provenance).
//
// Defaults are preserved, so nothing changes until the env vars are set. To
// stamp Floyd's real identity on new events, set on the prod deployment:
//   CIVIC_HUB_ID=civic-hub-floyd     (or your chosen id)
//   CIVIC_JURISDICTION=us-va-floyd
export const HUB_ID = process.env.CIVIC_HUB_ID ?? "civic-hub-local";
export const DEFAULT_JURISDICTION = process.env.CIVIC_JURISDICTION ?? "local";
