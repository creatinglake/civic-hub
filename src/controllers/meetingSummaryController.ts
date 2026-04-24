// Meeting-summary controllers — five HTTP surfaces in one file:
//
//   POST /internal/meeting-summary/run
//     Cron-triggered. Loads the configured MeetingSourceConnector,
//     discovers meeting entries, summarizes new ones via Claude, creates
//     a civic.meeting_summary draft process per entry. Protected by
//     CRON_SECRET bearer auth (shared with the digest cron). Respects
//     MEETING_SUMMARY_ENABLED=false. Per-meeting failures are isolated;
//     one bad meeting does not abort the batch.
//
//   GET /admin/meeting-summaries            (mounted in adminRoutes.ts)
//   GET /admin/meeting-summaries/:id        (mounted in adminRoutes.ts)
//   PATCH /admin/meeting-summaries/:id      (mounted in adminRoutes.ts)
//   POST /admin/meeting-summaries/:id/approve
//     Admin review queue. Pattern mirrors adminBriefController.
//
//   GET /meeting-summary/:id
//     Public read of published summaries only.

import { Request, Response } from "express";
import { emitEvent } from "../events/eventEmitter.js";
import {
  approveMeetingSummary,
  buildCreateInput,
  buildDescription,
  createMeetingSummaryState,
  discoverMeetings,
  editMeetingSummary,
  emitCreationEvents,
  floydMinutesConnector,
  getAdminReadModel,
  getAdminSummary,
  getPublicReadModel,
  resolveEffectiveInstructions,
  summarizeMeeting,
  type MeetingSourceConnector,
  type MeetingSummaryApprovalStatus,
  type MeetingSummaryConfig,
  type MeetingSummaryPatch,
  type MeetingSummaryProcessState,
  type SummaryBlock,
} from "../modules/civic.meeting_summary/index.js";
import {
  createProcess,
  getAllProcesses,
  getProcess,
  saveProcessState,
} from "../services/processService.js";
import { getAuthUser } from "../middleware/auth.js";
import { callClaude, DEFAULT_MODEL } from "../utils/anthropic.js";
import { fetchHtml, fetchPdf } from "../utils/http.js";
import { fetchYouTubeTranscript } from "../utils/youtube.js";

const DEFAULT_CONNECTOR_ID = "floyd-minutes-page";
const CRON_ACTOR = "system:meeting-summary-cron";

// Connector registry — MVP ships one; extending is a new entry here.
const CONNECTORS: Record<string, MeetingSourceConnector> = {
  "floyd-minutes-page": floydMinutesConnector,
};

function summaryState(
  record: { state: Record<string, unknown> },
): MeetingSummaryProcessState {
  return record.state as unknown as MeetingSummaryProcessState;
}

function isApprovalStatus(s: string): s is MeetingSummaryApprovalStatus {
  return s === "pending" || s === "approved" || s === "published";
}

function enabled(): boolean {
  const v = process.env.MEETING_SUMMARY_ENABLED?.trim().toLowerCase();
  return v !== "false";
}

function requireCronSecret(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.authorization ?? "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7).trim();
  return token.length > 0 && token === secret;
}

function modelName(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || DEFAULT_MODEL;
}

function connectorFor(id: string | undefined): MeetingSourceConnector | null {
  const lookup = id?.trim() || DEFAULT_CONNECTOR_ID;
  return CONNECTORS[lookup] ?? null;
}

// --- POST /internal/meeting-summary/run ------------------------------------

export async function handleRunMeetingSummary(
  req: Request,
  res: Response,
): Promise<void> {
  if (!requireCronSecret(req)) {
    res.status(401).json({ error: "Invalid or missing cron credential" });
    return;
  }

  if (!enabled()) {
    res.status(200).json({ skipped: true, reason: "meeting summary disabled" });
    return;
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    res.status(500).json({
      error:
        "ANTHROPIC_API_KEY must be set. Create a key at https://console.anthropic.com and add it to Vercel env vars.",
    });
    return;
  }

  const sourceUrl = process.env.MEETING_SOURCE_URL?.trim();
  if (!sourceUrl) {
    res.status(500).json({
      error:
        "MEETING_SOURCE_URL must be set (e.g. https://www.floydcova.gov/agendas-minutes).",
    });
    return;
  }

  const connectorId = process.env.MEETING_CONNECTOR_ID?.trim();
  const connector = connectorFor(connectorId);
  if (!connector) {
    res.status(500).json({
      error: `Unknown MEETING_CONNECTOR_ID "${connectorId}". Known: ${Object.keys(CONNECTORS).join(", ")}`,
    });
    return;
  }

  const cfg: MeetingSummaryConfig = {
    source_url: sourceUrl,
    extraction_instructions: resolveEffectiveInstructions(
      process.env.MEETING_EXTRACTION_INSTRUCTIONS ?? "",
    ),
    model: modelName(),
  };

  const started = Date.now();
  let discovered = 0;
  let created = 0;
  let skippedExisting = 0;
  let failed = 0;

  try {
    console.log(
      `[meeting-summary] run started connector=${connector.id} source=${cfg.source_url}`,
    );

    const entries = await discoverMeetings(connector, cfg, {
      fetchHtml,
      callClaude,
    });
    discovered = entries.length;

    // Build the set of existing source_ids once so the inner loop is O(1).
    const allProcesses = await getAllProcesses();
    const existingSourceIds = new Set<string>();
    for (const p of allProcesses) {
      if (p.definition.type !== "civic.meeting_summary") continue;
      const s = summaryState(p);
      if (typeof s?.source_id === "string") existingSourceIds.add(s.source_id);
    }

    for (const entry of entries) {
      if (existingSourceIds.has(entry.source_id)) {
        console.log(
          `[meeting-summary] skip existing source_id=${entry.source_id}`,
        );
        skippedExisting += 1;
        continue;
      }

      try {
        const summary = await summarizeMeeting(entry, cfg, {
          fetchPdf,
          fetchYouTubeTranscript,
          callClaude,
        });

        const createInput = buildCreateInput(entry, summary);
        const description = buildDescription(summary.blocks);

        const newProcess = await createProcess({
          definition: { type: "civic.meeting_summary", version: "0.1" },
          title: `Meeting summary: ${entry.meeting_date}`,
          description,
          jurisdiction: "us-va-floyd",
          createdBy: CRON_ACTOR,
          state: createInput as unknown as Record<string, unknown>,
        });

        const state = summaryState(newProcess);
        const ctx = {
          process_id: newProcess.id,
          hub_id: newProcess.hubId,
          jurisdiction: newProcess.jurisdiction,
          emit: emitEvent,
        };
        await emitCreationEvents(ctx, CRON_ACTOR, state);

        console.log(
          `[meeting-summary] created process=${newProcess.id} source_id=${entry.source_id} blocks=${summary.blocks.length}`,
        );
        created += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown error";
        console.warn(
          `[meeting-summary] failed source_id=${entry.source_id} error=${msg}`,
        );
        failed += 1;
      }
    }

    const duration_ms = Date.now() - started;
    console.log(
      `[meeting-summary] run complete discovered=${discovered} created=${created} skipped=${skippedExisting} failed=${failed} duration_ms=${duration_ms}`,
    );
    res.status(200).json({
      discovered,
      created,
      skipped_existing: skippedExisting,
      failed,
      duration_ms,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const duration_ms = Date.now() - started;
    console.error(`[meeting-summary] batch error: ${message}`);
    res.status(500).json({
      error: message,
      discovered,
      created,
      skipped_existing: skippedExisting,
      failed,
      duration_ms,
    });
  }
}

// --- Admin surfaces --------------------------------------------------------

export async function handleAdminListMeetingSummaries(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const statusFilter = req.query.status as string | undefined;
    const all = await getAllProcesses();
    const summaries = all
      .filter((p) => p.definition.type === "civic.meeting_summary")
      .map((p) =>
        getAdminSummary(summaryState(p), {
          id: p.id,
          title: p.title,
          createdAt: p.createdAt,
        }),
      );

    const filtered =
      statusFilter && isApprovalStatus(statusFilter)
        ? summaries.filter((s) => s.approval_status === statusFilter)
        : summaries;

    // Rank pending first, then approved, then published; newest within each.
    const rank: Record<string, number> = {
      pending: 0,
      approved: 1,
      published: 2,
    };
    filtered.sort((a, b) => {
      const statusA = (a.approval_status as string) ?? "";
      const statusB = (b.approval_status as string) ?? "";
      const r = (rank[statusA] ?? 99) - (rank[statusB] ?? 99);
      if (r !== 0) return r;
      const ga = (a.generated_at as string) ?? "";
      const gb = (b.generated_at as string) ?? "";
      return gb.localeCompare(ga);
    });

    res.json(filtered);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

export async function handleAdminGetMeetingSummary(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = req.params.id as string;
    const record = await getProcess(id);
    if (!record || record.definition.type !== "civic.meeting_summary") {
      res.status(404).json({ error: "Meeting summary not found" });
      return;
    }
    res.json(
      getAdminReadModel(summaryState(record), {
        id: record.id,
        title: record.title,
        createdAt: record.createdAt,
        createdBy: record.createdBy,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

export async function handlePatchMeetingSummary(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = req.params.id as string;
    const record = await getProcess(id);
    if (!record || record.definition.type !== "civic.meeting_summary") {
      res.status(404).json({ error: "Meeting summary not found" });
      return;
    }
    const state = summaryState(record);
    if (state.approval_status !== "pending") {
      res.status(409).json({
        error: `Cannot edit meeting summary: approval_status is "${state.approval_status}".`,
      });
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const patch: MeetingSummaryPatch = {};
    if (typeof body.meeting_title === "string") {
      patch.meeting_title = body.meeting_title;
    }
    if (Array.isArray(body.blocks)) {
      patch.blocks = body.blocks as SummaryBlock[];
    }
    if (typeof body.admin_notes === "string") {
      patch.admin_notes = body.admin_notes;
    }

    const actor = getAuthUser(res).id;
    const ctx = {
      process_id: record.id,
      hub_id: record.hubId,
      jurisdiction: record.jurisdiction,
      emit: emitEvent,
    };

    await editMeetingSummary(state, actor, patch, ctx);

    // If meeting_title changed, mirror it into the process-level title
    // so list views stay consistent. We keep process.title formatted
    // "Meeting summary: <date>" rather than the meeting_title itself —
    // the meeting_title lives in state and is the primary display name
    // on the admin + public surfaces.
    await saveProcessState(record);

    res.json(
      getAdminReadModel(state, {
        id: record.id,
        title: record.title,
        createdAt: record.createdAt,
        createdBy: record.createdBy,
      }),
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

export async function handleApproveMeetingSummary(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = req.params.id as string;
    const record = await getProcess(id);
    if (!record || record.definition.type !== "civic.meeting_summary") {
      res.status(404).json({ error: "Meeting summary not found" });
      return;
    }
    const state = summaryState(record);
    if (state.approval_status !== "pending") {
      res.status(409).json({
        error: `Meeting summary is already ${state.approval_status}.`,
      });
      return;
    }

    const actor = getAuthUser(res).id;
    const ctx = {
      process_id: record.id,
      hub_id: record.hubId,
      jurisdiction: record.jurisdiction,
      emit: emitEvent,
    };

    await approveMeetingSummary(state, actor, ctx);

    // Match the civic.brief convention: published summaries are terminal,
    // i.e. "finalized" in the spec's state machine. Skips "closed"
    // (no participation window to close).
    record.status = "finalized";
    await saveProcessState(record);

    res.json({
      message: "Meeting summary approved and published.",
      meeting_summary: getAdminReadModel(state, {
        id: record.id,
        title: record.title,
        createdAt: record.createdAt,
        createdBy: record.createdBy,
      }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

// --- GET /meeting-summary/:id (public) -------------------------------------

export async function handleGetPublicMeetingSummary(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = req.params.id as string;
    const record = await getProcess(id);
    if (!record || record.definition.type !== "civic.meeting_summary") {
      res.status(404).json({ error: "Meeting summary not found" });
      return;
    }
    const model = getPublicReadModel(summaryState(record), {
      id: record.id,
      title: record.title,
      createdAt: record.createdAt,
    });
    if (!model) {
      // Not yet published — invisible to the public.
      res.status(404).json({ error: "Meeting summary not found" });
      return;
    }
    res.json(model);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
