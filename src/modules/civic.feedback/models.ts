// civic.feedback — operator-facing product feedback.
//
// NOT a civic event. This module exists alongside civic.* siblings
// for naming consistency only — feedback submissions persist in their
// own table and never flow through emitEvent(). Public /events readers
// must not see this surface.

export type FeedbackCategory = "idea" | "bug" | "moderation" | "general";

export const FEEDBACK_CATEGORIES: ReadonlyArray<FeedbackCategory> = [
  "idea",
  "bug",
  "moderation",
  "general",
];

export interface FeedbackSubmission {
  id: string;
  created_at: string;
  category: FeedbackCategory;
  message: string;
  name: string | null;
  email: string | null;
  user_id: string | null;
  user_agent: string | null;
}

export interface SubmitFeedbackInput {
  category: FeedbackCategory;
  message: string;
  name?: string | null;
  email?: string | null;
  user_id?: string | null;
  user_agent?: string | null;
}
