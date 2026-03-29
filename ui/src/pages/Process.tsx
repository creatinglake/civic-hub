import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { getProcessState, type ProcessState, type VoteState, type ProposalState } from "../services/api";
import VotePanel from "../components/VotePanel";
import ProposalPanel from "../components/ProposalPanel";

// Simulated current user — will be replaced with real identity later
const CURRENT_USER = "user:demo";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function Process() {
  const { id } = useParams<{ id: string }>();
  const [process, setProcess] = useState<ProcessState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(() => {
    if (!id) return;
    getProcessState(id, CURRENT_USER)
      .then(setProcess)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  if (loading) return <p className="detail-page">Loading...</p>;
  if (error) return <p className="detail-page error">Error: {error}</p>;
  if (!process) return <p className="detail-page">Not found.</p>;

  const isVote = process.type === "civic.vote";
  const isProposal = process.type === "civic.proposal";

  return (
    <div className="page detail-page">
      <Link to="/" className="back-link">
        &larr; {isProposal ? "All proposals" : "All votes"}
      </Link>

      <div className="process-header">
        <h1>{process.title}</h1>
        {isProposal ? (
          <span className={`status-badge ${process.status === "closed" ? "status-promoted" : "status-gathering"}`}>
            {process.status === "closed" ? "promoted" : "gathering support"}
          </span>
        ) : (
          <span className={`status-badge status-${process.status}`}>
            {process.status}
          </span>
        )}
      </div>

      <p className="process-description">{process.description}</p>

      <div className="process-meta">
        <span>Created by {process.created_by}</span>
        <span>Created {formatDate(process.created_at)}</span>
        {isVote && process.status === "open" && (process as VoteState).closes_at && (
          <span>Vote closes on {formatDate((process as VoteState).closes_at)}</span>
        )}
        {isVote && process.status === "closed" && <span>Voting closed</span>}
      </div>

      {isVote && (
        <VotePanel
          process={process as VoteState}
          actor={CURRENT_USER}
          onVoted={fetchState}
        />
      )}

      {isProposal && (
        <ProposalPanel
          proposal={process as ProposalState}
          actor={CURRENT_USER}
          onEndorsed={fetchState}
        />
      )}
    </div>
  );
}
