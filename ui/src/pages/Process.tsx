import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { getProcessState, type ProcessState, type VoteState, type ProposalState } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useRequireAuth } from "../hooks/useRequireAuth";
import VotePanel from "../components/VotePanel";
import ProposalPanel from "../components/ProposalPanel";
import IssueContent from "../components/IssueContent";
import CommunityInputPanel from "../components/CommunityInputPanel";
import AuthModal from "../components/AuthModal";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function statusLabel(status: string): string {
  switch (status) {
    case "draft": return "draft";
    case "proposed": return "gathering support";
    case "threshold_met": return "ready to activate";
    case "active": return "active";
    case "closed": return "closed";
    case "finalized": return "finalized";
    case "open": return "open";
    default: return status;
  }
}

function statusClass(status: string): string {
  if (status === "proposed" || status === "threshold_met") return "status-gathering";
  if (status === "closed") return "status-closed";
  return `status-${status}`;
}

export default function Process() {
  const { id } = useParams<{ id: string }>();
  const { actorId } = useAuth();
  const { showAuthModal, closeAuthModal, handleAuthComplete } = useRequireAuth();
  const [process, setProcess] = useState<ProcessState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentActor = actorId ?? "anonymous";

  const fetchState = useCallback(() => {
    if (!id) return;
    getProcessState(id, currentActor)
      .then(setProcess)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, currentActor]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  if (loading) return <p className="detail-page">Loading...</p>;
  if (error) return <p className="detail-page error">Error: {error}</p>;
  if (!process) return <p className="detail-page">Not found.</p>;

  const isVote = process.type === "civic.vote";
  const isProposal = process.type === "civic.proposal";
  const voteState = isVote ? (process as VoteState) : null;
  const hasContent = isVote && voteState?.content;

  return (
    <div className="page detail-page">
      {showAuthModal && (
        <AuthModal onComplete={handleAuthComplete} onDismiss={closeAuthModal} />
      )}

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
          <span className={`status-badge ${statusClass(process.status)}`}>
            {statusLabel(process.status)}
          </span>
        )}
      </div>

      {/* Jurisdiction badge */}
      {isVote && voteState?.jurisdiction && voteState.jurisdiction !== "local" && (
        <span className="jurisdiction-badge">{voteState.jurisdiction}</span>
      )}

      {/* Plain description (always shown) */}
      <p className="process-description">{process.description}</p>

      <div className="process-meta">
        <span>Created by {process.created_by}</span>
        <span>Created {formatDate(process.created_at)}</span>
        {isVote && process.status === "active" && (process as VoteState).closes_at && (
          <span>Vote closes on {formatDate((process as VoteState).closes_at!)}</span>
        )}
        {isVote && process.status === "closed" && <span>Voting closed</span>}
        {isVote && process.status === "finalized" && <span>Voting finalized</span>}
      </div>

      {/* Vote/Proposal interaction panel */}
      {isVote && (
        <VotePanel
          process={process as VoteState}
          actor={currentActor}
          onVoted={fetchState}
        />
      )}

      {isProposal && (
        <ProposalPanel
          proposal={process as ProposalState}
          actor={currentActor}
          onEndorsed={fetchState}
        />
      )}

      {/* Structured issue content (only for processes with content) */}
      {hasContent && voteState?.content && (
        <IssueContent content={voteState.content} />
      )}

      {/* Community input (only for processes that enable it) */}
      {isVote && id && voteState?.content?.community_input && (
        <CommunityInputPanel
          processId={id}
          actor={currentActor}
          config={voteState.content.community_input}
        />
      )}
    </div>
  );
}
