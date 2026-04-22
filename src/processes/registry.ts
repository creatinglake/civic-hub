// Process registry — maps process types to their handlers.
//
// This registry enables a plugin-style architecture for civic processes.
// Each process type (e.g. civic.vote, civic.proposal) implements a handler.
// Future work may allow dynamic loading, but for now this is static.

import { ProcessHandler, ProcessFactory } from "./types.js";
import voteProcess from "./voteProcess.js";
import proposalProcess from "./proposalProcess.js";
import briefProcess from "./briefProcess.js";

// civic.brief is registered here but can be omitted by hubs that don't want
// brief generation. When present, the vote adapter's process.close handler
// spawns a brief after the vote closes. When absent, vote closes simply
// terminate without a brief.
const processRegistry: Record<string, ProcessHandler> = {
  "civic.vote": voteProcess,
  "civic.proposal": proposalProcess,
  "civic.brief": briefProcess,
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
