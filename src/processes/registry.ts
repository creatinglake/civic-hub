// Process registry — maps process types to their handlers.
//
// This registry enables a plugin-style architecture for civic processes.
// Each process type (e.g. civic.vote, civic.proposal) implements a handler.
// Future work may allow dynamic loading, but for now this is static.

import { ProcessHandler, ProcessFactory } from "./types.js";
import voteProcess from "./voteProcess.js";
import proposalProcess from "./proposalProcess.js";
import briefProcess from "./briefProcess.js";
import announcementProcess from "./announcementProcess.js";
import meetingSummaryProcess from "./meetingSummaryProcess.js";

// civic.brief + civic.announcement + civic.meeting_summary are registered
// here but can be omitted by hubs that don't want those capabilities.
// When civic.brief is present, the vote adapter spawns a brief on close;
// when absent, vote closes terminate without a brief. civic.announcement
// is entirely self-contained via /announcement routes.
// civic.meeting_summary is self-contained via /meeting-summary and
// /admin/meeting-summaries, plus the cron endpoint at
// /internal/meeting-summary/run — a hub that omits this module simply
// doesn't mount those routes and nothing else breaks.
const processRegistry: Record<string, ProcessHandler> = {
  "civic.vote": voteProcess,
  "civic.proposal": proposalProcess,
  "civic.brief": briefProcess,
  "civic.announcement": announcementProcess,
  "civic.meeting_summary": meetingSummaryProcess,
};

/**
 * Process factory — set by the service layer at startup.
 * Allows handlers to create new processes without importing processService directly.
 */
let processFactory: ProcessFactory | null = null;

export function setProcessFactory(factory: ProcessFactory): void {
  processFactory = factory;
}

export function getProcessFactory(): ProcessFactory {
  if (!processFactory) {
    throw new Error("Process factory not initialized — service layer must call setProcessFactory()");
  }
  return processFactory;
}

/**
 * Look up the handler for a given process type.
 * Returns undefined if no handler is registered.
 */
export function getProcessHandler(type: string): ProcessHandler | undefined {
  return processRegistry[type];
}

/** List all registered process types */
export function getRegisteredTypes(): string[] {
  return Object.keys(processRegistry);
}
