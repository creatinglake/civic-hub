import { useState } from "react";
import type { ProcessState } from "../services/api";
import { submitVote } from "../services/api";

interface Props {
  process: ProcessState;
  onVoted: () => void;
}

export default function VotePanel({ process, onVoted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [voted, setVoted] = useState<string | null>(null);

  const isClosed = process.status === "closed";

  async function handleVote(option: string) {
    setLoading(true);
    setError(null);
    try {
      await submitVote(process.id, "user:demo", option);
      setVoted(option);
      onVoted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="vote-panel">
      {/* Options / buttons */}
      <div className="vote-options">
        <h4>{isClosed ? "Voting closed" : "Cast your vote"}</h4>
        <div className="vote-buttons">
          {process.options.map((option) => (
            <button
              key={option}
              className={`vote-button ${voted === option ? "voted" : ""}`}
              onClick={() => handleVote(option)}
              disabled={isClosed || loading}
            >
              {option}
            </button>
          ))}
        </div>
        {voted && <p className="vote-confirmation">You voted: {voted}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      {/* Tally */}
      <div className="vote-tally">
        <h4>Results</h4>
        {process.options.map((option) => {
          const count = process.tally[option] ?? 0;
          const pct = process.total_votes > 0
            ? Math.round((count / process.total_votes) * 100)
            : 0;
          return (
            <div key={option} className="tally-row">
              <span className="tally-label">{option}</span>
              <div className="tally-bar-track">
                <div
                  className="tally-bar-fill"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="tally-count">
                {count} ({pct}%)
              </span>
            </div>
          );
        })}
        <p className="tally-total">{process.total_votes} total votes</p>
      </div>
    </div>
  );
}
