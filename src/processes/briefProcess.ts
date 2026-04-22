// civic.brief process handler — thin adapter around the civic.brief module.
//
// The handler registers `civic.brief` as a process type so briefs are
// stored in the same process store as votes and proposals. Briefs are not
// exposed through the generic `POST /process/:id/action` dispatcher —
// their admin surface is `/admin/briefs/*`. This adapter therefore
// accepts no actions; it exists to give the registry a way to
// initialize state and produce read models for briefs alongside other
// process types.

import { Process, ProcessAction } from "../models/process.js";
import { ProcessHandler } from "./types.js";
import {
  createBriefState,
  getAdminReadModel,
  getAdminSummary,
  type BriefProcessState,
  type CreateBriefFromVoteInput,
} from "../modules/civic.brief/index.js";

function getState(process: Process): BriefProcessState {
  return process.state as unknown as BriefProcessState;
}

const briefProcess: ProcessHandler = {
  type: "civic.brief",

  initializeState(input: Record<string, unknown>): Record<string, unknown> {
    // Briefs are always created programmatically (from a closed vote), so
    // we expect the host hub to pass a CreateBriefFromVoteInput shape in
    // the initialization input. Callers outside the vote-close flow are
    // not supported.
    const required = ["source_process_id", "vote_title", "tally", "total_votes"] as const;
    for (const key of required) {
      if (!(key in input)) {
        throw new Error(
          `civic.brief initializeState requires "${key}" — briefs can only be created by the vote-close flow.`,
        );
      }
    }
    const briefInput: CreateBriefFromVoteInput = {
      source_process_id: input.source_process_id as string,
      vote_title: input.vote_title as string,
      tally: input.tally as Record<string, number>,
      total_votes: input.total_votes as number,
    };
    return createBriefState(briefInput) as unknown as Record<string, unknown>;
  },

  async handleAction(
    _process: Process,
    action: ProcessAction,
  ): Promise<Record<string, unknown>> {
    // No HTTP actions reach briefs. Any attempt indicates a misrouting.
    throw new Error(
      `civic.brief does not accept process actions (received "${action.type}"). ` +
        `Brief review happens via /admin/briefs/*.`,
    );
  },

  getReadModel(process: Process): Record<string, unknown> {
    const state = getState(process);
    return getAdminReadModel(state, {
      id: process.id,
      title: process.title,
      createdAt: process.createdAt,
      createdBy: process.createdBy,
    });
  },

  getSummary(process: Process): Record<string, unknown> {
    const state = getState(process);
    return getAdminSummary(state, {
      id: process.id,
      title: process.title,
      createdAt: process.createdAt,
    });
  },
};

export default briefProcess;
