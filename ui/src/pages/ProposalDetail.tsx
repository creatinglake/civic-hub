import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { getCivicProposal, supportCivicProposal, type CivicProposalDetail } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useRequireAuth } from "../hooks/useRequireAuth";
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
    case "submitted": return "gathering support";
    case "endorsed": return "endorsed";
    case "converted": return "converted to vote";
    case "archived": return "archived";
    default: return status;
  }
}

function statusClass(status: string): string {
  switch (status) {
    case "submitted": return "status-gathering";
    case "endorsed": return "admin-status-endorsed";
    case "converted": return "admin-status-converted";
    case "archived": return "admin-status-archived";
    default: return "";
  }
}

export default function ProposalDetail() {
  const { id } = useParams<{ id: string }>();
  const { actorId } = useAuth();
  const { requireAuth, showAuthModal, closeAuthModal, handleAuthComplete } = useRequireAuth();
  const [proposal, setProposal] = useState<CivicProposalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [endorsing, setEndorsing] = useState(false);

  const currentActor = actorId ?? "anonymous";

  const fetchProposal = useCallback(() => {
    if (!id) return;
    getCivicProposal(id, currentActor)
      .then(setProposal)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id, currentActor]);

  useEffect(() => {
    fetchProposal();
  }, [fetchProposal]);

  async function doEndorse() {
    if (!id || !actorId) return;
    setEndorsing(true);
    setError(null);
    try {
      await supportCivicProposal(id, actorId);
      fetchProposal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to endorse");
    } finally {
      setEndorsing(false);
    }
  }

  function handleEndorse() {
    requireAuth(() => doEndorse());
  }

  if (loading) return <p className="detail-page">Loading...</p>;
  if (error && !proposal) return <p className="detail-page error">Error: {error}</p>;
  if (!proposal) return <p className="detail-page">Not found.</p>;

  const progress = Math.min(
    (proposal.support_count / proposal.support_threshold) * 100,
    100
  );

  return (
    <div className="page detail-page">
      {showAuthModal && (
        <AuthModal onComplete={handleAuthComplete} onDismiss={closeAuthModal} />
      )}

      <Link to="/" className="back-link">&larr; Home</Link>

      <div className="process-header">
        <h1>{proposal.title}</h1>
        <span className={`status-badge ${statusClass(proposal.status)}`}>
          {statusLabel(proposal.status)}
        </span>
      </div>

      {proposal.description && (
        <p className="process-description">{proposal.description}</p>
      )}

      <div className="process-meta">
        <span>Proposed by {proposal.submitted_by}</span>
        <span>Submitted {formatDate(proposal.created_at)}</span>
      </div>

      {/* Endorsement section */}
      {proposal.status === "submitted" && (
        <div className="proposal-endorsement-section">
          <h3>Community Endorsement</h3>
          <p className="proposal-endorsement-text">
            This proposal needs {proposal.support_threshold} endorsements to be
            reviewed for an official vote.
          </p>

          <div className="proposal-progress">
            <div className="proposal-progress-track">
              <div
                className="proposal-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="proposal-progress-label">
              {proposal.support_count} / {proposal.support_threshold}
            </span>
          </div>

          <div className="proposal-action">
            {error && <p className="form-error">{error}</p>}
            {proposal.has_supported ? (
              <p className="endorse-confirmation">You have endorsed this proposal.</p>
            ) : (
              <button
                className="endorse-button"
                onClick={handleEndorse}
                disabled={endorsing}
              >
                {endorsing ? "Endorsing..." : "Endorse This Proposal"}
              </button>
            )}
          </div>
        </div>
      )}

      {proposal.status === "endorsed" && (
        <div className="proposal-endorsed-notice">
          <h3>Endorsed</h3>
          <p>
            This proposal has received enough community support and is awaiting
            admin review to become an official vote.
          </p>
          <div className="proposal-progress">
            <div className="proposal-progress-track">
              <div className="proposal-progress-fill" style={{ width: "100%" }} />
            </div>
            <span className="proposal-progress-label">
              {proposal.support_count} / {proposal.support_threshold}
            </span>
          </div>
        </div>
      )}

      {proposal.status === "converted" && (
        <div className="proposal-converted-notice">
          <p>This proposal has been converted to an official vote.</p>
        </div>
      )}

      {proposal.status === "archived" && (
        <div className="proposal-archived-notice">
          <p>This proposal has been archived.</p>
        </div>
      )}

      {/* Links */}
      {proposal.optional_links.length > 0 && (
        <div className="proposal-links-section">
          <h3>Related Links</h3>
          <ul className="issue-link-list">
            {proposal.optional_links.map((link, i) => (
              <li key={i}>
                <a href={link} target="_blank" rel="noopener noreferrer">{link}</a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
