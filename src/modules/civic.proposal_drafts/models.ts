import type { Category } from "../civic.proposal_assistant/models.js";
import type { Suggestion } from "../civic.proposal_assistant/models.js";

export type DraftStatus = "drafting" | "submitted" | "abandoned";

export interface ProposalDraft {
  id: string;
  user_id: string;
  category: Category | null;
  title: string;
  description: string;
  sources: string;
  considerations: string;
  conversation_history: Array<{ role: "user" | "assistant"; content: string }>;
  last_review_result: Suggestion[] | null;
  draft_modified_since_review: boolean;
  steward_approved: boolean | null;
  assistant_helped: boolean;
  status: DraftStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateDraftInput {
  user_id: string;
  category?: Category;
}

export interface UpdateDraftInput {
  title?: string;
  description?: string;
  sources?: string;
  considerations?: string;
  category?: Category;
  skip_modified_flag?: boolean;
}
