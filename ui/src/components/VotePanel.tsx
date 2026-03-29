import { useState } from "react";
import type { VoteState } from "../services/api";
import { submitVote } from "../services/api";

interface Props {
  process: VoteState;
  actor: string;
  onVoted: () => void;
}

export default function VotePanel({ process, actor, onVoted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justVoted, setJustVoted] = useState<string | null>(null);

  const isClosed = process.status === "closed";
  const canSeeResults = process.tally !== null;

  async function handleVote(option: string) {
    setLoading(true);
    setError(null);
    try {
      await submitVote(process.id, actor, option);
      setJustVoted(option);
      onVoted(); // refresh state — results will now be visible
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="vote-panel">
      {/* Vote buttons */}
      <div className="vote-options">
        <h4>{isClosed ? "Voting closed" : "Cast your vote"}</h4>
        <div className="vote-buttons">
          {process.options.map((option) => (
            <button
              key={option}
              className={`vote-button ${justVoted === option ? "voted" : ""}`}
              onClick={() => handleVote(option)}
              disabled={isClosed || loading}
            >
              {option}
            </button>
          ))}
        </div>
        {justVoted && <p className="vote-confirmation">You voted: {justVoted}</p>}
        {error && <p className="error">{error}</p>}
      </div>

      {/* Results — only visible after voting or when closed */}
      <div className="vote-tally">
        <h4>Results</h4>
        {canSeeResults ? (
          <>
            {process.options.map((option) => {
              const count = process.tally![option] ?? 0;
              const total = process.total_votes ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
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
          </>
        ) : (
          <p className="results-hidden">
            Results will be visible after you vote.
          </p>
        )}
      </div>
    </div>
  );
}
