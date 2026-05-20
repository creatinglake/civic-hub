export type Phase = "brainstorm" | "review" | "free_form";

export type Category = "issue" | "idea" | "project";

export interface DraftState {
  title: string;
  description: string;
  sources: string;
  considerations: string;
}

export interface Suggestion {
  severity: "soft" | "hard";
  quoted_text: string | null;
  field: "title" | "description" | "sources" | "considerations" | null;
  message: string;
  suggested_revision: string | null;
}

export interface DraftProposal {
  title: string;
  description: string;
  sources: string;
  considerations: string;
}

export interface AssistantResponse {
  message: string;
  suggestions: Suggestion[];
  draft_proposal: DraftProposal | null;
}

export interface HubConfig {
  hub_name: string;
  community_description: string;
  coc_path: string;
  best_practices_path: string;
}

export interface CallAssistantInput {
  phase: Phase;
  category: Category;
  draft_state: DraftState;
  conversation_history: Array<{ role: "user" | "assistant"; content: string }>;
  user_message: string;
  hub_config: HubConfig;
}
