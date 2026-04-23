// civic.announcement module — service functions (pure state transitions)
//
// No I/O beyond the injected emit callback. Persistence of state changes
// is the host hub's responsibility (via processService.saveProcessState).

import type {
  AnnouncementActionOutcome,
  AnnouncementContent,
  AnnouncementContentPatch,
  AnnouncementLink,
  AnnouncementProcessContext,
  AnnouncementProcessState,
  CreateAnnouncementInput,
} from "./models.js";
import {
  BODY_MAX,
  LINK_LABEL_MAX,
  LINK_URL_MAX,
  LINKS_MAX,
  TITLE_MAX,
} from "./models.js";
import { canEdit } from "./lifecycle.js";
import {
  emitAnnouncementCreated,
  emitAnnouncementResultPublished,
  emitAnnouncementUpdated,
} from "./events.js";

export function createAnnouncementState(
  input: CreateAnnouncementInput,
): AnnouncementProcessState {
  const content = sanitizeContent({
    title: input.title,
    body: input.body,
    links: input.links ?? [],
  });
  return {
    type: "civic.announcement",
    content,
    author_id: input.author_id,
    author_role: input.author_role,
    created_at: new Date().toISOString(),
    last_edited_at: null,
    edit_count: 0,
  };
}

/**
 * Emit the two instant-publish events: created, then result_published.
 * Called by the host hub once the row is persisted.
 */
export async function emitPublicationEvents(
  ctx: AnnouncementProcessContext,
  actor: string,
  state: AnnouncementProcessState,
): Promise<void> {
  await emitAnnouncementCreated(ctx, actor, state);
  await emitAnnouncementResultPublished(ctx, actor, state);
}

/**
 * Apply an edit. Authorization check lives here so it's untied from the
 * HTTP layer and any future non-HTTP caller. Emits `updated`.
 */
export async function updateAnnouncement(
  state: AnnouncementProcessState,
  editor: { id: string; role: "admin" | "author" },
  patch: AnnouncementContentPatch,
  ctx: AnnouncementProcessContext,
): Promise<AnnouncementActionOutcome> {
  if (!canEdit(state, editor.id, editor.role)) {
    throw new Error("Not authorized to edit this announcement.");
  }

  const editedFields: Array<"title" | "body" | "links"> = [];
  const nextContent: AnnouncementContent = { ...state.content };

  if (patch.title !== undefined && patch.title !== state.content.title) {
    nextContent.title = patch.title;
    editedFields.push("title");
  }
  if (patch.body !== undefined && patch.body !== state.content.body) {
    nextContent.body = patch.body;
    editedFields.push("body");
  }
  if (patch.links !== undefined) {
    nextContent.links = patch.links;
    // Compare stringified to detect actual change; keeps the event honest.
    if (JSON.stringify(patch.links) !== JSON.stringify(state.content.links)) {
      editedFields.push("links");
    }
  }

  if (editedFields.length === 0) {
    // No-op edit — don't emit a spurious `updated` event.
    return { state, result: { edited_fields: [] } };
  }

  state.content = sanitizeContent(nextContent);
  state.last_edited_at = new Date().toISOString();
  state.edit_count += 1;

  await emitAnnouncementUpdated(ctx, editor.id, state, editedFields);

  return {
    state,
    result: {
      edited_fields: editedFields,
      edit_count: state.edit_count,
      last_edited_at: state.last_edited_at,
    },
  };
}

function sanitizeContent(c: AnnouncementContent): AnnouncementContent {
  const title = (c.title ?? "").trim();
  if (title.length === 0) {
    throw new Error("Announcement title is required.");
  }
  if (title.length > TITLE_MAX) {
    throw new Error(`Announcement title must be <= ${TITLE_MAX} characters.`);
  }

  const body = (c.body ?? "").trim();
  if (body.length === 0) {
    throw new Error("Announcement body is required.");
  }
  if (body.length > BODY_MAX) {
    throw new Error(`Announcement body must be <= ${BODY_MAX} characters.`);
  }

  const rawLinks = Array.isArray(c.links) ? c.links : [];
  if (rawLinks.length > LINKS_MAX) {
    throw new Error(`At most ${LINKS_MAX} links per announcement.`);
  }
  const links: AnnouncementLink[] = [];
  for (const l of rawLinks) {
    const label = (l?.label ?? "").trim();
    const url = (l?.url ?? "").trim();
    if (label.length === 0 && url.length === 0) continue; // silently skip empty rows
    if (label.length === 0 || url.length === 0) {
      throw new Error("Each link requires both a label and a URL.");
    }
    if (label.length > LINK_LABEL_MAX) {
      throw new Error(`Link label must be <= ${LINK_LABEL_MAX} characters.`);
    }
    if (url.length > LINK_URL_MAX) {
      throw new Error(`Link URL must be <= ${LINK_URL_MAX} characters.`);
    }
    if (!/^https?:\/\//i.test(url)) {
      throw new Error(`Link URL must start with http:// or https://: ${url}`);
    }
    links.push({ label, url });
  }

  return { title, body, links };
}

/** Public read model — what GET /announcement/:id returns. */
export function getPublicReadModel(
  state: AnnouncementProcessState,
  processMeta: { id: string; createdAt: string },
): Record<string, unknown> {
  return {
    id: processMeta.id,
    type: "civic.announcement",
    title: state.content.title,
    body: state.content.body,
    links: state.content.links,
    author_id: state.author_id,
    author_role: state.author_role,
    created_at: state.created_at,
    last_edited_at: state.last_edited_at,
    edit_count: state.edit_count,
  };
}

/** Summary used by GET /announcements list. */
export function getPublicSummary(
  state: AnnouncementProcessState,
  processMeta: { id: string; createdAt: string },
): Record<string, unknown> {
  return {
    id: processMeta.id,
    type: "civic.announcement",
    title: state.content.title,
    author_role: state.author_role,
    created_at: state.created_at,
    last_edited_at: state.last_edited_at,
    edit_count: state.edit_count,
  };
}
