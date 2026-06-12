import { useState } from "react";
import type { StatementRecord, VoteDirection } from "../../services/api";
import VoteControls from "./VoteControls";
import "./StatementCard.css";

interface Props {
  statement: StatementRecord;
  onVote: (statementId: number, direction: VoteDirection) => Promise<void>;
}

export default function StatementCard({ statement, onVote }: Props) {
  const [voted, setVoted] = useState(false);
  const [voting, setVoting] = useState(false);

  async function handleVote(direction: VoteDirection) {
    setVoting(true);
    try {
      await onVote(statement.id, direction);
      setVoted(true);
    } finally {
      setVoting(false);
    }
  }

  return (
    <div className={`statement-card ${voted ? "statement-card--voted" : ""}`}>
      {statement.is_seed && <span className="statement-seed-badge">Seed</span>}
      <p className="statement-text">{statement.text}</p>
      {!voted && <VoteControls onVote={handleVote} disabled={voting} />}
      {voted && <p className="statement-voted-label">Vote recorded</p>}
    </div>
  );
}
