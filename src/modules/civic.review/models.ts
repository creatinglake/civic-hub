export type ReviewStatus =
  | "pending_review"
  | "changes_requested"
  | "approved"
  | "declined"
  | "withdrawn";

export interface ProcessReview {
  id: string;
  process_id: string;
  creator_id: string;
  creator_name: string;
  creator_email: string;
  status: ReviewStatus;
  created_at: string;
  updated_at: string;
}

export type ReviewTurnAction =
  | "submit"
  | "request_changes"
  | "approve"
  | "decline"
  | "revise_resubmit"
  | "withdraw";

export type ReviewActorRole = "creator" | "admin";

export interface ProcessSnapshot {
  title: string;
  description: string;
  content?: Record<string, unknown> | null;
  config?: Record<string, unknown> | null;
}

export interface ReviewTurn {
  id: string;
  review_id: string;
  turn_number: number;
  actor: string;
  actor_role: ReviewActorRole;
  action: ReviewTurnAction;
  note: string | null;
  process_snapshot: ProcessSnapshot | null;
  created_at: string;
}

export interface SubmitForReviewInput {
  process_type: string;
  title: string;
  description: string;
  creator_id: string;
  creator_name: string;
  creator_email: string;
  content?: Record<string, unknown>;
  config?: Record<string, unknown>;
  state?: Record<string, unknown>;
}

export interface ReviseInput {
  title?: string;
  description?: string;
  content?: Record<string, unknown>;
  config?: Record<string, unknown>;
  note?: string;
}
