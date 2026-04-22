// Admin brief controller — list, read, edit, and approve civic.brief
// processes.
//
// The approve handler orchestrates the full publication sequence:
//   1. edit check (status must be "pending")
//   2. mark "approved", set approved_at
//   3. deliver email (HALT on failure — later steps won't run)
//   4. record delivered_to
//   5. emit civic.process.outcome_recorded
//   6. mark "published", set published_at
//   7. emit civic.process.result_published (brief)
//   8. finalize the linked vote (civic.vote.finalizeVote), which emits
//      civic.process.result_published for the vote
//
// Mutations to in-memory state are persisted via saveProcessState only on
// success. Durable event emissions that happen mid-sequence are not
// rolled back on failure — this matches the existing hub architecture
// (events are the source of truth) and is an accepted pilot-phase
// limitation for the same reason as the executeAction race condition.

import { Request, Response } from "express";
import { emitEvent } from "../events/eventEmitter.js";
import {
  approveBrief,
  editBrief,
  getAdminReadModel,
  getAdminSummary,
  type BriefContentPatch,
  type BriefProcessState,
  type BriefPublicationStatus,
} from "../modules/civic.brief/index.js";
import {
  finalizeVote,
  type VoteProcessState,
} from "../modules/civic.vote/index.js";
import {
  getAllProcesses,
  getProcess,
  saveProcessState,
} from "../services/processService.js";
import { getAuthUser } from "../middleware/auth.js";
import { sendEmail, parseRecipients } from "../services/mailer.js";
import { uiBaseUrl } from "../utils/baseUrl.js";

const HUB_LABEL = "Floyd Civic Hub";

function briefState(record: { state: Record<string, unknown> }): BriefProcessState {
  return record.state as unknown as BriefProcessState;
}

function voteState(record: { state: Record<string, unknown> }): VoteProcessState {
  return record.state as unknown as VoteProcessState;
}

function publicBriefUrl(briefId: string): string {
  return `${uiBaseUrl()}/brief/${briefId}`;
}

function isBriefPublicationStatus(s: string): s is BriefPublicationStatus {
  return s === "pending" || s === "approved" || s === "published";
}

/**
 * GET /admin/briefs — list briefs with optional ?status= filter.
 * Returns pending first (needing review), then approved, then published.
 */
export async function handleAdminListBriefs(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const statusFilter = req.query.status as string | undefined;
    const all = await getAllProcesses();
    const briefs = all.filter((p) => p.definition.type === "civic.brief");

    const summaries = briefs.map((p) => ({
      ...getAdminSummary(briefState(p), {
        id: p.id,
        title: p.title,
        createdAt: p.createdAt,
      }),
    }));

    const filtered = statusFilter && isBriefPublicationStatus(statusFilter)
      ? summaries.filter((b) => b.publication_status === statusFilter)
      : summaries;

    // Sort: pending first, then approved, then published. Within each bucket,
    // newest generated first.
    const rank: Record<string, number> = { pending: 0, approved: 1, published: 2 };
    filtered.sort((a, b) => {
      const statusA = (a.publication_status as string) ?? "";
      const statusB = (b.publication_status as string) ?? "";
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

/**
 * GET /admin/briefs/:id — full brief detail for admin review.
 */
export async function handleAdminGetBrief(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = req.params.id as string;
    const briefRecord = await getProcess(id);
    if (!briefRecord || briefRecord.definition.type !== "civic.brief") {
      res.status(404).json({ error: "Brief not found" });
      return;
    }
    const model = getAdminReadModel(briefState(briefRecord), {
      id: briefRecord.id,
      title: briefRecord.title,
      createdAt: briefRecord.createdAt,
      createdBy: briefRecord.createdBy,
    });
    res.json(model);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

/**
 * PATCH /admin/briefs/:id — edit concerns, suggestions, and admin_notes.
 * Rejects with 409 if the brief is no longer in pending status.
 */
export async function handlePatchBrief(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = req.params.id as string;
    const briefRecord = await getProcess(id);
    if (!briefRecord || briefRecord.definition.type !== "civic.brief") {
      res.status(404).json({ error: "Brief not found" });
      return;
    }
    const state = briefState(briefRecord);
    if (state.publication_status !== "pending") {
      res.status(409).json({
        error: `Cannot edit brief: publication_status is "${state.publication_status}".`,
      });
      return;
    }

    const body = req.body ?? {};
    const patch: BriefContentPatch = {};
    if (Array.isArray(body.comments)) patch.comments = body.comments;
    if (typeof body.admin_notes === "string") patch.admin_notes = body.admin_notes;

    const actor = getAuthUser(res).id;
    const ctx = {
      process_id: briefRecord.id,
      hub_id: briefRecord.hubId,
      jurisdiction: briefRecord.jurisdiction,
      emit: emitEvent,
    };

    await editBrief(state, actor, patch, ctx);
    await saveProcessState(briefRecord);

    const model = getAdminReadModel(state, {
      id: briefRecord.id,
      title: briefRecord.title,
      createdAt: briefRecord.createdAt,
      createdBy: briefRecord.createdBy,
    });
    res.json(model);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}

/**
 * POST /admin/briefs/:id/approve — run the full approval orchestration.
 */
export async function handleApproveBrief(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = req.params.id as string;
    const briefRecord = await getProcess(id);
    if (!briefRecord || briefRecord.definition.type !== "civic.brief") {
      res.status(404).json({ error: "Brief not found" });
      return;
    }

    const state = briefState(briefRecord);
    if (state.publication_status !== "pending") {
      res.status(409).json({
        error: `Brief is already ${state.publication_status}.`,
      });
      return;
    }

    const recipients = parseRecipients(process.env.BOARD_RECIPIENT_EMAIL);
    if (recipients.length === 0) {
      res.status(503).json({
        error:
          "Approval unavailable: BOARD_RECIPIENT_EMAIL is not configured on the server.",
      });
      return;
    }

    const actor = getAuthUser(res).id;
    const ctx = {
      process_id: briefRecord.id,
      hub_id: briefRecord.hubId,
      jurisdiction: briefRecord.jurisdiction,
      emit: emitEvent,
    };

    // Closure called by the brief module once the brief reaches "published".
    // Loads the linked vote, calls the vote module's finalizeVote directly
    // (library-only; no HTTP path), then persists the vote.
    const finalizeLinkedVote = async (voteId: string, byActor: string) => {
      const voteRecord = await getProcess(voteId);
      if (!voteRecord) {
        throw new Error(`Linked vote not found: ${voteId}`);
      }
      if (voteRecord.definition.type !== "civic.vote") {
        throw new Error(
          `Linked process ${voteId} is not a civic.vote (type=${voteRecord.definition.type})`,
        );
      }
      if (voteRecord.status === "finalized") {
        // Idempotency: if the vote was already finalized (e.g. a prior
        // approval attempt succeeded at this step), skip cleanly.
        return;
      }
      const voteCtx = {
        process_id: voteRecord.id,
        hub_id: voteRecord.hubId,
        jurisdiction: voteRecord.jurisdiction,
        emit: emitEvent,
      };
      await finalizeVote(voteState(voteRecord), byActor, voteCtx);
      voteRecord.status = voteState(voteRecord).status;
      await saveProcessState(voteRecord);
    };

    await approveBrief(state, actor, ctx, {
      recipients,
      hubLabel: HUB_LABEL,
      publicBriefUrl: publicBriefUrl(briefRecord.id),
      sendEmail,
      finalizeLinkedVote,
    });

    // Persist brief mutations (publication_status, timestamps, delivered_to).
    // Also advance process-level status to match: published briefs are
    // terminal, i.e. "finalized" in the spec's state machine.
    briefRecord.status = "finalized";
    await saveProcessState(briefRecord);

    const model = getAdminReadModel(state, {
      id: briefRecord.id,
      title: briefRecord.title,
      createdAt: briefRecord.createdAt,
      createdBy: briefRecord.createdBy,
    });
    res.json({ message: "Brief approved and published.", brief: model });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ error: message });
  }
}
