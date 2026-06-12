export interface DeliberationSummary {
  summary_text: string;
  directed_questions: string[];
  top_consensus_statements: {
    statement_text: string;
    agree_rate: number;
    vote_count: number;
  }[];
  opinion_groups: {
    group_id: number;
    size: number;
    representative_statements: {
      text: string;
      agreement_within_group: number;
    }[];
  }[];
  participation_stats: {
    total_participants: number;
    total_statements: number;
    total_votes: number;
    opinion_groups_formed: number;
  };
  linked_polis_data_uri: string;
  methodology: {
    prompt_version: string;
    model_used: string;
    generated_at: string;
  };
}

export interface PolisDeliberationState {
  polis_conversation_id: string;
  polis_base_url: string;
  topic: string;
  framing: string;
  deadline: string | null;
  participation_threshold: number | null;
  last_math_tick: number;
  summary: DeliberationSummary | null;
  summary_status: "pending" | "generating" | "complete" | "failed";
  continued_from_response_id: string | null;
}

export interface PolisDeliberationInput {
  topic: string;
  framing: string;
  deadline?: string;
  participation_threshold?: number;
  seed_statements?: string[];
  continued_from_response_id?: string;
  polis_moderation?: "open" | "strict";
}
