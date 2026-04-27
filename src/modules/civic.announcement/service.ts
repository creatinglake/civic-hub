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
  IMAGE_ALT_MAX,
  IMAGE_URL_MAX,
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
    image_url: input.image_url ?? null,
    image_alt: input.image_alt ?? null,
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

  const editedFields: Array<"title" | "body" | "links" | "image"> = [];
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
  // Image fields: only an image_url change (or alt-text change) counts
  // as a content edit. Either image_url or image_alt being present in
  // the patch is enough to enter the branch — they're validated together
  // by sanitizeContent.
  const imagePatched =
    patch.image_url !== undefined || patch.image_alt !== undefined;
  if (imagePatched) {
    if (patch.image_url !== undefined) nextContent.image_url = patch.image_url;
    if (patch.image_alt !== undefined) nextContent.image_alt = patch.image_alt;
    if (
      (patch.image_url !== undefined &&
        patch.image_url !== (state.content.image_url ?? null)) ||
      (patch.image_alt !== undefined &&
        patch.image_alt !== (state.content.image_alt ?? null))
    ) {
      editedFields.push("image");
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

  // Image attachment validation. image_url is optional; image_alt is
  // optional but strongly encouraged for accessibility. The composer
  // surfaces a hint about screen-reader users; we don't reject empty
  // alt because (a) some images are decorative — WCAG actually wants
  // empty alt in that case — and (b) requiring alt tends to produce
  // low-quality "image" / "photo" alt strings that are worse than empty.
  let image_url: string | null = null;
  let image_alt: string | null = null;
  const rawUrl = typeof c.image_url === "string" ? c.image_url.trim() : "";
  const rawAlt = typeof c.image_alt === "string" ? c.image_alt.trim() : "";
  if (rawUrl.length > 0) {
    if (rawUrl.length > IMAGE_URL_MAX) {
      throw new Error(`Image URL must be <= ${IMAGE_URL_MAX} characters.`);
    }
    if (!/^https?:\/\//i.test(rawUrl)) {
      throw new Error("Image URL must start with http:// or https://.");
    }
    if (rawAlt.length > IMAGE_ALT_MAX) {
      throw new Error(`Alt text must be <= ${IMAGE_ALT_MAX} characters.`);
    }
    image_url = rawUrl;
    image_alt = rawAlt.length > 0 ? rawAlt : null;
  } else if (rawAlt.length > 0) {
    // Alt without an image is meaningless — treat as no image rather
    // than rejecting outright (the composer can race the two fields).
    image_url = null;
    image_alt = null;
  }

  return { title, body, links, image_url, image_alt };
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
    image_url: state.content.image_url ?? null,
    image_alt: state.content.image_alt ?? null,
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
    image_url: state.content.image_url ?? null,
    image_alt: state.content.image_alt ?? null,
    author_role: state.author_role,
    created_at: state.created_at,
    last_edited_at: state.last_edited_at,
    edit_count: state.edit_count,
  };
}
