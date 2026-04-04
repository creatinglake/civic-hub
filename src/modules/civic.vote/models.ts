// civic.vote module — type definitions
//
// These types are self-contained. The module makes no assumptions
// about the host hub's ORM, schema, or storage layer.

export type VoteStatus =
  | "draft"
  | "proposed"
  | "threshold_met"
  | "active"
  | "closed"
  | "finalized";

export interface VoteConfig {
  hub_id: string;
  jurisdiction: string;
  support_threshold: number;
  voting_duration_ms: number;
  activation_mode: "direct" | "proposal_required";
}

export interface VoteResult {
  tally: Record<string, number>;
  total_votes: number;
  computed_at: string;
}

export interface VoteProcessState {
  type: "civic.vote";
  status: VoteStatus;
  options: string[];
  votes: Record<string, string>; // actor → option
  supporters: Record<string, boolean>; // actor → supported
  support_count: number;
  config: {
    support_threshold: number;
    voting_duration_ms: number;
    activation_mode: "direct" | "proposal_required";
  };
  voting_opens_at: string | null;
  voting_closes_at: string | null;
  result: VoteResult | null;
}

/**
 * Event emission callback — injected by the host hub.
 * The module never imports the hub's event system directly.
 */
export interface EmitEventFn {
  (input: {
    event_type: string;
    actor: string;
    process_id: string;
    hub_id: string;
    jurisdiction: string;
    data: Record<string, unknown>;
  }): void;
}

/** Result returned by every module action */
export interface ActionOutcome {
  state: VoteProcessState;
  result: Record<string, unknown>;
}
