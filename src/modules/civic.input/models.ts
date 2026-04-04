// civic.input module — type definitions
//
// Community input is stored independently from votes.
// It is not used in vote tallying or lifecycle transitions.

export interface CommunityInput {
  id: string;
  process_id: string;
  author_id: string;
  body: string;
  submitted_at: string; // ISO 8601
}
