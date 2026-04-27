// civic.vote_results module — public surface
//
// A hub wishing to offer admin-reviewed vote results registers this
// module via the process registry. A hub that doesn't want them simply
// doesn't register it — no other code paths depend on the module being
// present (votes still close, just without a published results page).

export type {
  CreateVoteResultsFromVoteInput,
  EmitEventFn,
  FinalizeLinkedVoteFn,
  SendEmailFn,
  VoteContextSnapshot,
  VoteResultsActionOutcome,
  VoteResultsContent,
  VoteResultsContentPatch,
  VoteResultsPositionBreakdown,
  VoteResultsProcessContext,
  VoteResultsProcessState,
  VoteResultsPublicationStatus,
} from "./models.js";

export {
  approveVoteResults,
  createVoteResultsState,
  editVoteResults,
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

export { formatVoteResultsEmail, headlineFor } from "./email.js";

export const PROCESS_DESCRIPTOR = {
  type: "civic.vote_results",
  version: "0.1",
  lifecycle: {
    states: ["active", "closed", "finalized"],
    publication_sub_states: ["pending", "approved", "published"],
    paths: {
      standard: ["active", "closed", "finalized"],
    },
  },
  actions: [
    // All vote-results transitions happen via the admin HTTP surface,
    // not process actions on /process/:id/action. The admin routes
    // orchestrate the approval sequence.
  ],
  events: [
    "civic.process.created",
    "civic.process.aggregation_completed",
    "civic.process.updated",
    "civic.process.outcome_recorded",
    "civic.process.result_published",
  ],
} as const;
