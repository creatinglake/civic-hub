// civic.receipts module — type definitions
//
// Maintains strict separation between vote records and user identity.
// The votes table stores receipt_id + choice with NO user reference.
// The participation table stores user_id + process_id with NO receipt reference.

export interface VoteRecord {
  receipt_id: string;
  process_id: string;
  choice: string;
  created_at: string; // internal only — never exposed publicly
}

export interface UserParticipation {
  user_id: string;
  process_id: string;
  has_voted: boolean;
}
