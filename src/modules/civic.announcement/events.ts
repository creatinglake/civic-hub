// civic.announcement module — event emission helpers
//
// Per Civic Event Spec v0.1 §4-5. action_url_path points events at the
// public announcement page so feed posts and federated consumers route
// to the human-facing UI rather than the JSON API.

import type {
  AnnouncementContentPatch,
  AnnouncementProcessContext,
  AnnouncementProcessState,
} from "./models.js";
import { BODY_PREVIEW_LEN } from "./models.js";

function announcementPath(process_id: string): string {
  return `/announcement/${process_id}`;
}

function bodyPreview(body: string): string {
  return body.trim().slice(0, BODY_PREVIEW_LEN);
}

export async function emitAnnouncementCreated(
  ctx: AnnouncementProcessContext,
  actor: string,
  state: AnnouncementProcessState,
): Promise<void> {
  await ctx.emit({
    event_type: "civic.process.created",
    actor,
    process_id: ctx.process_id,
    hub_id: ctx.hub_id,
    jurisdiction: ctx.jurisdiction,
    action_url_path: announcementPath(ctx.process_id),
    data: {
      announcement: {
        title: state.content.title,
        body_preview: bodyPreview(state.content.body),
        author_role: state.author_role,
      },
    },
  });
}

/**
 * Emitted immediately after `created` — announcements skip Phases 1–5
 * and go directly to publication. See HANDOFF.md for the spec-compliance
 * note about skipped phases for instant-publish announcements.
 */
export async function emitAnnouncementResultPublished(
  ctx: AnnouncementProcessContext,
  actor: string,
  state: AnnouncementProcessState,
): Promise<void> {
  await ctx.emit({
    event_type: "civic.process.result_published",
    actor,
    process_id: ctx.process_id,
    hub_id: ctx.hub_id,
    jurisdiction: ctx.jurisdiction,
    action_url_path: announcementPath(ctx.process_id),
    data: {
      announcement: {
        id: ctx.process_id,
        title: state.content.title,
        author_role: state.author_role,
      },
    },
  });
}

export async function emitAnnouncementUpdated(
  ctx: AnnouncementProcessContext,
  actor: string,
  state: AnnouncementProcessState,
  editedFields: Array<"title" | "body" | "links" | "image">,
): Promise<void> {
  await ctx.emit({
    event_type: "civic.process.updated",
    actor,
    process_id: ctx.process_id,
    hub_id: ctx.hub_id,
    jurisdiction: ctx.jurisdiction,
    action_url_path: announcementPath(ctx.process_id),
    data: {
      announcement: {
        title: state.content.title,
        body_preview: bodyPreview(state.content.body),
        edit_count: state.edit_count,
        edited_fields: editedFields,
      },
    },
  });
}

// Re-export for the adapter that needs the raw preview util (keeps the
// module as the single source of truth for preview length).
export { bodyPreview };

// Make TS happy if nothing else references the patch type yet; harmless.
export type { AnnouncementContentPatch };
