// civic.announcement module — public surface

export type {
  AnnouncementActionOutcome,
  AnnouncementAuthorRole,
  AnnouncementContent,
  AnnouncementContentPatch,
  AnnouncementLink,
  AnnouncementModeration,
  AnnouncementProcessContext,
  AnnouncementProcessState,
  AnnouncementSource,
  CreateAnnouncementInput,
  EmitEventFn,
} from "./models.js";

export {
  BODY_MAX,
  BODY_PREVIEW_LEN,
  IMAGE_ALT_MAX,
  IMAGE_URL_MAX,
  LINK_LABEL_MAX,
  LINK_URL_MAX,
  LINKS_MAX,
  MODERATION_REASON_MAX,
  TITLE_MAX,
} from "./models.js";

export { canEdit } from "./lifecycle.js";

export {
  createAnnouncementState,
  emitPublicationEvents,
  getAdminReadModel,
  getPublicReadModel,
  getPublicSummary,
  removeAnnouncement,
  restoreAnnouncement,
  updateAnnouncement,
} from "./service.js";

export {
  emitAnnouncementCreated,
  emitAnnouncementResultPublished,
  emitAnnouncementUpdated,
} from "./events.js";

export const PROCESS_DESCRIPTOR = {
  type: "civic.announcement",
  version: "0.1",
  lifecycle: {
    // Instant-publish: Phase 0 (Initiation) → Phase 6 (Publication) directly.
    // Spec Phases 1–5 are intentionally skipped for this process kind.
    // See HANDOFF.md and the process_kind discussion.
    states: ["finalized"],
  },
  actions: [
    // All transitions happen via the /announcement HTTP surface, not the
    // generic /process/:id/action dispatcher.
  ],
  events: [
    "civic.process.created",
    "civic.process.result_published",
    "civic.process.updated",
  ],
} as const;
