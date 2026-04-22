// civic.brief module — public surface
//
// A hub wishing to offer Civic Briefs registers this module via the
// process registry. A hub that doesn't want briefs simply doesn't
// register it — no other code paths depend on the module being present.

export type {
  BriefActionOutcome,
  BriefContent,
  BriefContentPatch,
  BriefPositionBreakdown,
  BriefProcessContext,
  BriefProcessState,
  BriefPublicationStatus,
  CreateBriefFromVoteInput,
  EmitEventFn,
  FinalizeLinkedVoteFn,
  SendEmailFn,
} from "./models.js";

export {
  approveBrief,
  createBriefState,
  editBrief,
  emitCreationEvents,
  getAdminReadModel,
  getAdminSummary,
  getPublicReadModel,
} from "./service.js";

export {
  assertPublicationTransition,
  canApprove,
  canEdit,
  isPublished,
} from "./lifecycle.js";

export { formatBriefEmail, headlineFor } from "./email.js";

export const PROCESS_DESCRIPTOR = {
  type: "civic.brief",
  version: "0.1",
  lifecycle: {
    states: ["active", "closed", "finalized"],
    publication_sub_states: ["pending", "approved", "published"],
    paths: {
      standard: ["active", "closed", "finalized"],
    },
  },
  actions: [
    // All brief transitions happen via the admin HTTP surface, not process
    // actions on /process/:id/action. The admin routes orchestrate the
    // approval sequence; briefs are intentionally not exposed through the
    // generic action dispatcher.
  ],
  events: [
    "civic.process.created",
    "civic.process.aggregation_completed",
    "civic.process.updated",
    "civic.process.outcome_recorded",
    "civic.process.result_published",
  ],
} as const;
