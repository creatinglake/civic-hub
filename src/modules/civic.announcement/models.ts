// civic.announcement module — type definitions
//
// Announcements are one-way communications from Board members (or admins)
// to residents. Instant-publish on create: Phase 0 → Phase 6 directly,
// with no framing, activation, participation, aggregation, or outcome.
// Edits are allowed and transparent (edit_count increments, `updated`
// event emitted).
//
// The module is self-contained and portable. The host hub injects the
// event emit function via AnnouncementProcessContext; the module never
// imports the hub's event system directly.

export type AnnouncementAuthorRole = "board" | "admin";

export interface AnnouncementLink {
  label: string;
  url: string;
}

export interface AnnouncementContent {
  title: string;           // required, <= TITLE_MAX
  body: string;            // required, plain text, <= BODY_MAX
  links: AnnouncementLink[]; // optional, <= LINKS_MAX
}

export interface AnnouncementProcessState {
  type: "civic.announcement";
  content: AnnouncementContent;
  author_id: string;
  author_role: AnnouncementAuthorRole;
  created_at: string;       // ISO 8601
  last_edited_at: string | null;
  edit_count: number;
}

/** Length caps enforced by the module (also enforced client-side). */
export const TITLE_MAX = 200;
export const BODY_MAX = 5000;
export const LINKS_MAX = 5;
export const LINK_LABEL_MAX = 100;
export const LINK_URL_MAX = 500;
/** First N chars of the body included in event data as a preview. */
export const BODY_PREVIEW_LEN = 200;

/**
 * Event emission callback — injected by the host hub.
 */
export interface EmitEventFn {
  (input: {
    event_type: string;
    actor: string;
    process_id: string;
    hub_id: string;
    jurisdiction: string;
    data: Record<string, unknown>;
    action_url_path?: string;
  }): Promise<unknown>;
}

export interface AnnouncementProcessContext {
  process_id: string;
  hub_id: string;
  jurisdiction: string;
  emit: EmitEventFn;
}

export interface AnnouncementActionOutcome {
  state: AnnouncementProcessState;
  result: Record<string, unknown>;
}

/** Input when a Board member / admin creates an announcement. */
export interface CreateAnnouncementInput {
  title: string;
  body: string;
  links?: AnnouncementLink[];
  author_id: string;
  author_role: AnnouncementAuthorRole;
}

/** Partial update used by PATCH /announcement/:id. */
export interface AnnouncementContentPatch {
  title?: string;
  body?: string;
  links?: AnnouncementLink[];
}
