import { useState } from "react";
import { Link } from "react-router-dom";
import type { ProposalState } from "../services/api";
import { endorseProposal } from "../services/api";

interface Props {
  proposal: ProposalState;
  actor: string;
  onEndorsed: () => void;
}

export default function ProposalPanel({ proposal, actor, onEndorsed }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justEndorsed, setJustEndorsed] = useState(false);

  const isClosed = proposal.status === "closed";
  const hasSupported = proposal.has_supported || justEndorsed;
  const remaining = proposal.support_threshold - proposal.support_count;
  const pct = Math.round(
    (proposal.support_count / proposal.support_threshold) * 100
  );

  async function handleEndorse() {
    setLoading(true);
    setError(null);
    try {
      await endorseProposal(proposal.id, actor);
      setJustEndorsed(true);
      onEndorsed();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Endorsement failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="proposal-panel">
      {/* Endorsement progress */}
      <div className="proposal-endorsement">
        <h4>Endorsements</h4>
        <div className="proposal-progress">
          <div className="proposal-progress-track">
            <div
              className="proposal-progress-fill"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="proposal-progress-label">
            {proposal.support_count} of {proposal.support_threshold} endorsements
          </span>
        </div>

        {!isClosed && remaining > 0 && (
          <p className="proposal-needs">
            Needs {remaining} more endorsement{remaining !== 1 ? "s" : ""} to become an official vote
          </p>
        )}
      </div>

      {/* Action */}
      {!isClosed && (
        <div className="proposal-action">
          {hasSupported ? (
            <p className="endorse-confirmation">You endorsed this proposal</p>
          ) : (
            <button
              className="endorse-button"
              onClick={handleEndorse}
              disabled={loading}
            >
              {loading ? "Endorsing..." : "Endorse Proposal"}
            </button>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {/* Promoted state */}
      {isClosed && proposal.promoted_vote_id && (
        <div className="proposal-promoted">
          <p className="proposal-promoted-text">
            This proposal reached its endorsement threshold and has been promoted to an official vote.
          </p>
          <Link to={`/process/${proposal.promoted_vote_id}`} className="promoted-vote-link">
            Go to vote &rarr;
          </Link>
        </div>
      )}

      {/* Proposed options preview */}
      <div className="proposal-options-preview">
        <h4>Proposed vote options</h4>
        <div className="proposal-options-list">
          {proposal.proposed_options.map((opt) => (
            <span key={opt} className="proposal-option-tag">{opt}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
