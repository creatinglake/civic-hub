import type { Suggestion } from "../civic.proposal_assistant/models.js";

export type ProjectDraftStatus = "drafting" | "submitted" | "abandoned";

export interface ProjectDraft {
  id: string;
  user_id: string;
  title: string;
  description: string;
  sources: string;
  conversation_history: Array<{ role: "user" | "assistant"; content: string }>;
  last_review_result: Suggestion[] | null;
  draft_modified_since_review: boolean;
  assistant_helped: boolean;
  status: ProjectDraftStatus;
  created_at: string;
  updated_at: string;
}

export interface CreateProjectDraftInput {
  user_id: string;
}

export interface UpdateProjectDraftInput {
  title?: string;
  description?: string;
  sources?: string;
  skip_modified_flag?: boolean;
}
