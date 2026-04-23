// Announcement controller — Board / admin posting and editing, plus the
// public read surface.
//
// POST /announcement            — create (requireBoardOrAdmin)
// PATCH /announcement/:id       — edit (requireBoardOrAdmin + authorship check inside)
// GET /announcement/:id         — public read
// GET /announcements            — public list

import { Request, Response } from "express";
import {
  emitPublicationEvents,
  getPublicReadModel,
  getPublicSummary,
  updateAnnouncement,
  type AnnouncementAuthorRole,
  type AnnouncementContentPatch,
  type AnnouncementLink,
  type AnnouncementProcessState,
} from "../modules/civic.announcement/index.js";
import { emitEvent } from "../events/eventEmitter.js";
import {
  createProcess,
  getAllProcesses,
  getProcess,
  saveProcessState,
} from "../services/processService.js";
import { getAuthUser } from "../middleware/auth.js";

function getState(record: { state: Record<string, unknown> }): AnnouncementProcessState {
  return record.state as unknown as AnnouncementProcessState;
}

function ctxFor(record: { id: string; hubId: string; jurisdiction: string }) {
  return {
    process_id: record.id,
    hub_id: record.hubId,
    jurisdiction: record.jurisdiction,
    emit: emitEvent,
  };
}

/** Read an announcement's links payload from a request body, or return []. */
function readLinks(body: unknown): AnnouncementLink[] | undefined {
  const b = body as { links?: unknown } | null | undefined;
  if (!b || b.links === undefined) return undefined;
  if (!Array.isArray(b.links)) {
    throw new Error("links must be an array");
  }
  return b.links
    .filter(
      (l): l is { label: string; url: string } =>
        typeof l === "object" &&
        l !== null &&
        typeof (l as { label?: unknown }).label === "string" &&
        typeof (l as { url?: unknown }).url === "string",
    )
    .map((l) => ({ label: l.label, url: l.url }));
}

export async function handleCreateAnnouncement(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const user = getAuthUser(res);
    const role = res.locals.effectiveRole as AnnouncementAuthorRole;
    const body = (req.body ?? {}) as { title?: unknown; body?: unknown };

    if (typeof body.title !== "string" || typeof body.body !== "string") {
      res.status(400).json({ error: "title and body are required (string)." });
      return;
    }

    const links = readLinks(req.body);

    // Spawn the process via the generic factory so the created event is
    // emitted consistently. The announcement module's publication events
    // fire separately below.
    const record = await createProcess({
      definition: { type: "civic.announcement", version: "0.1" },
      title: body.title,
      description: body.body, // descriptor shows the body as description for list consumers
      createdBy: user.id,
      state: {
        title: body.title,
        body: body.body,
        author_id: user.id,
        author_role: role,
        links: links ?? [],
      },
    });

    // The generic factory emitted civic.process.created with a minimal
    // payload. Our module fires BOTH created (with announcement-specific
    // data) and result_published. To avoid duplicate `created` events,
    // emit only result_published here. The Feed's event-type filter will
    // ignore the generic created event from the generic factory for
    // civic.announcement (see FeedPost.tsx).
    const state = getState(record);
    const ctx = ctxFor(record);
    // The module's emitPublicationEvents fires both created + result_published,
    // which would duplicate the generic created. We want only the module's
    // richer `created` plus `result_published`, so we also need the generic
    // created to be filtered client-side. Simpler: just fire result_published
    // here. The generic created from processService already carries type +
    // title, which is enough for consumers that only look at core fields.
    const events = await import("../modules/civic.announcement/events.js");
    await events.emitAnnouncementResultPublished(ctx, user.id, state);

    // Auto-finalize the process status — announcements are instant-publish.
    record.status = "finalized";
    await saveProcessState(record);

    res.status(201).json(
      getPublicReadModel(state, { id: record.id, createdAt: record.createdAt }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(400).json({ error: message });
  }
}

export async function handleUpdateAnnouncement(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = req.params.id as string;
    const record = await getProcess(id);
    if (!record || record.definition.type !== "civic.announcement") {
      res.status(404).json({ error: "Announcement not found" });
      return;
    }
    const user = getAuthUser(res);
    const role = res.locals.effectiveRole as AnnouncementAuthorRole;

    const body = (req.body ?? {}) as {
      title?: unknown;
      body?: unknown;
      links?: unknown;
    };
    const patch: AnnouncementContentPatch = {};
    if (typeof body.title === "string") patch.title = body.title;
    if (typeof body.body === "string") patch.body = body.body;
    if (body.links !== undefined) {
      const links = readLinks(req.body);
      if (links !== undefined) patch.links = links;
    }

    const state = getState(record);
    try {
      const outcome = await updateAnnouncement(
        state,
        { id: user.id, role },
        patch,
        ctxFor(record),
      );
      await saveProcessState(record);
      res.json({
        ...getPublicReadModel(outcome.state, {
          id: record.id,
          createdAt: record.createdAt,
        }),
        edited_fields: outcome.result.edited_fields,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      if (message.startsWith("Not authorized")) {
        res.status(403).json({ error: message });
      } else {
        res.status(400).json({ error: message });
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

export async function handleGetAnnouncement(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = req.params.id as string;
    const record = await getProcess(id);
    if (!record || record.definition.type !== "civic.announcement") {
      res.status(404).json({ error: "Announcement not found" });
      return;
    }
    res.json(
      getPublicReadModel(getState(record), {
        id: record.id,
        createdAt: record.createdAt,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

export async function handleListAnnouncements(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const limitRaw = req.query.limit as string | undefined;
    const limit = limitRaw ? Math.max(1, Math.min(200, parseInt(limitRaw, 10))) : undefined;

    const all = await getAllProcesses();
    const summaries = all
      .filter((p) => p.definition.type === "civic.announcement")
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map((p) =>
        getPublicSummary(getState(p), {
          id: p.id,
          createdAt: p.createdAt,
        }),
      );

    res.json(limit ? summaries.slice(0, limit) : summaries);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
