import type { Suggestion } from "../civic.proposal_assistant/models.js";

export type VoteDraftStatus = "drafting" | "submitted" | "abandoned";

export interface VoteDraft {
  id: string;
  user_id: string;
  title: string;
  description: string;
  sources: string;
  voting_duration_ms: number;
  method: string; // "yes_no_unsure" | "approval"
  custom_options: string[] | null;
  conversation_history: Array<{ role: "user" | "assistant"; content: string }>;
  last_review_result: Suggestion[] | null;
  draft_modified_since_review: boolean;
  assistant_helped: boolean;
  status: VoteDraftStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateVoteDraftInput {
  user_id: string;
}

export interface UpdateVoteDraftInput {
  title?: string;
  description?: string;
  sources?: string;
  voting_duration_ms?: number;
  method?: string;
  custom_options?: string[] | null;
  skip_modified_flag?: boolean;
}
