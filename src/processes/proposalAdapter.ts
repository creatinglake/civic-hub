// civic.proposal process handler — thin adapter around the civic.proposals module.
//
// A Proposal is an idea board: float an idea, gauge interest/discussion. It is
// NOT a vote and does not convert into one (the "gather support → become a
// vote" mechanism lives in the civic.vote `proposal_required` lifecycle, not
// here). See /decisions/audit-2026-06-25-process-and-feed-consistency.md.
//
// Proposals are NOT driven through the generic /process/:id/action dispatcher.
// Intake and endorsement happen via the /proposals HTTP surface and the
// civic.proposals module's own service functions, which own the relational
// `proposals` table. This adapter exists so proposals live in the same process
// store and register as a known process type for the unified read layer
// (getAllProcesses / listProcessSummaries), discovery, and the dispatch loop.
//
// Because the module's rich read models are async (they query the `proposals`
// table) and the ProcessHandler read interface is synchronous, this adapter
// returns only the canonical fields carried on the `processes` row. Full
// proposal detail continues to be served by the dedicated /proposals routes.

import { Process, ProcessAction } from "../models/process.js";
import { ProcessHandler } from "./types.js";
import { emitEvent } from "../events/eventEmitter.js";
import { closeExpiredProposal } from "../modules/civic.proposals/index.js";

const proposalAdapter: ProcessHandler = {
  type: "civic.proposal",

  // The relational `proposals` row holds proposal state; the canonical
  // `processes` row needs no type-specific state.
  initializeState(): Record<string, unknown> {
    return {};
  },

  async handleAction(
    _process: Process,
    action: ProcessAction,
  ): Promise<Record<string, unknown>> {
    throw new Error(
      `civic.proposal does not accept generic process actions (received "${action.type}"). ` +
        `Support a proposal via the /proposals/:id/support endpoint.`,
    );
  },

  getReadModel(process: Process): Record<string, unknown> {
    return {
      id: process.id,
      type: process.definition.type,
      title: process.title,
      description: process.description,
      status: process.status,
      created_at: process.createdAt,
      created_by: process.createdBy,
    };
  },

  getSummary(process: Process): Record<string, unknown> {
    return {
      id: process.id,
      type: process.definition.type,
      title: process.title,
      status: process.status,
      created_at: process.createdAt,
      created_by: process.createdBy,
    };
  },

  // Lazy deadline-close: when a live proposal's closes_at has elapsed, the
  // module transitions it to "closed" (child row + canonical processes row) and
  // emits civic.proposal.closed. The processes row is the source of truth for
  // the canonical status carried here, so reflect the new status in-memory for
  // the summary/read model produced right after this returns.
  async closeIfExpired(process: Process): Promise<Process> {
    if (process.status !== "active") return process;
    const closed = await closeExpiredProposal(process.id, emitEvent);
    if (closed) process.status = "closed";
    return process;
  },
};

export default proposalAdapter;
