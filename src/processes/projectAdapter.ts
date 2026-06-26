// civic.project process handler — thin adapter around the civic.projects module.
//
// A Project is a resident- or org-run initiative with updates, comments, and
// support/oppose sentiment. Like proposals, projects are NOT driven through the
// generic /process/:id/action dispatcher: their lifecycle is owned by the
// civic.projects module and the /projects HTTP surface, which back the
// relational `projects` table. This adapter exists so projects live in the same
// process store and register as a known process type for the unified read layer
// (getAllProcesses / listProcessSummaries), discovery, and the dispatch loop.
//
// The module's rich read models are async (they query the `projects` table)
// while the ProcessHandler read interface is synchronous, so this adapter
// returns only the canonical fields carried on the `processes` row. Full
// project detail continues to be served by the dedicated /projects routes.

import { Process, ProcessAction } from "../models/process.js";
import { ProcessHandler } from "./types.js";

const projectAdapter: ProcessHandler = {
  type: "civic.project",

  // The relational `projects` row holds project state; the canonical
  // `processes` row needs no type-specific state.
  initializeState(): Record<string, unknown> {
    return {};
  },

  async handleAction(
    _process: Process,
    action: ProcessAction,
  ): Promise<Record<string, unknown>> {
    throw new Error(
      `civic.project does not accept generic process actions (received "${action.type}"). ` +
        `Use the /projects endpoints for updates, comments, and sentiment.`,
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
};

export default projectAdapter;
