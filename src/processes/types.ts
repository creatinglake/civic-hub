// Process handler interface — the contract every process type must implement.
//
// Each handler encapsulates all logic for a single process type:
//   - initializing state on creation
//   - handling actions (mutations)
//   - producing a read model for UI consumption
//   - producing a summary for list views

import { Process, ProcessAction, CreateProcessInput } from "../models/process.js";

export interface ProcessHandler {
  /** The process type this handler manages (e.g., "civic.vote") */
  type: string;

  /** Initialize process-specific state from creation input */
  initializeState(input: Record<string, unknown>): Record<string, unknown>;

  /** Handle an action — returns result data. May mutate process/state and emit events. */
  handleAction(process: Process, action: ProcessAction): Record<string, unknown>;

  /** Produce a UI-friendly read model. Actor is optional (for visibility rules). */
  getReadModel(process: Process, actor?: string): Record<string, unknown>;

  /** Produce a summary for list views */
  getSummary(process: Process): Record<string, unknown>;
}

/**
 * Factory function type for creating processes from within handlers.
 * Injected by the service layer to avoid circular dependencies.
 * Used by handlers that need to spawn new processes (e.g., proposal → vote).
 */
export type ProcessFactory = (input: CreateProcessInput) => Process;
