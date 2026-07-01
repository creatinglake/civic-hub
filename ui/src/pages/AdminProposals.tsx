import { useEffect, useState } from "react";
import {
  adminListProposals,
  adminGetProposal,
  archiveProposal as apiArchiveProposal,
  type CivicProposalSummary,
  type CivicProposalDetail,
} from "../services/api";
import AdminTabs from "../components/AdminTabs";

// A Proposal is an idea board (float an idea, gauge interest/discussion) — it
// does NOT become a vote. This page lets admins review proposals and archive
// (hide) ones that violate guidelines; it is moderation only.

type View = "list" | "detail";

export default function AdminProposals() {
  const [view, setView] = useState<View>("list");
  const [proposals, setProposals] = useState<CivicProposalSummary[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<CivicProposalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  function loadProposals() {
    setLoading(true);
    adminListProposals()
      .then(setProposals)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadProposals();
  }, []);

  function openDetail(id: string) {
    setError(null);
    setActionMessage(null);
    adminGetProposal(id)
      .then((p) => {
        setSelectedProposal(p);
        setView("detail");
      })
      .catch((err) => setError(err.message));
  }

  async function handleArchive(id: string) {
    setError(null);
    try {
      await apiArchiveProposal(id);
      setActionMessage("Proposal archived.");
      setView("list");
      setSelectedProposal(null);
      loadProposals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Archive failed");
    }
  }

  function statusLabel(status: string): string {
    switch (status) {
      case "submitted": return "Submitted";
      case "archived": return "Archived";
      default: return status;
    }
  }

  function statusClass(status: string): string {
    switch (status) {
      case "submitted": return "admin-status-submitted";
      case "archived": return "admin-status-archived";
      default: return "";
    }
  }

  // --- LIST VIEW ---
  if (view === "list") {
    return (
      <div className="page detail-page admin-page">
        <AdminTabs />
        <h1>Admin: Proposals</h1>
        <p className="admin-subtitle">
          Resident-submitted proposals (idea board). Archive any that violate
          guidelines.
        </p>

        {actionMessage && <p className="admin-action-message">{actionMessage}</p>}
        {error && <p className="form-error">{error}</p>}
        {loading && <p>Loading...</p>}

        {!loading && proposals.length === 0 && (
          <p className="empty-state-inline">
            No proposals yet. Resident-submitted ideas land here for moderation.
          </p>
        )}

        {!loading && proposals.length > 0 && (
          <ul className="admin-proposal-list">
            {proposals.map((p) => (
              <li key={p.id} className="admin-proposal-item" onClick={() => openDetail(p.id)}>
                <div className="admin-proposal-header">
                  <h3>{p.title}</h3>
                  <span className={`status-badge ${statusClass(p.status)}`}>
                    {statusLabel(p.status)}
                  </span>
                </div>
                <div className="admin-proposal-meta">
                  <span>{p.support_count} supporter{p.support_count !== 1 ? "s" : ""}</span>
                  <span>by {p.submitted_by}</span>
                  <span>{new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // --- DETAIL VIEW ---
  if (view === "detail" && selectedProposal) {
    return (
      <div className="page detail-page admin-page">
        <button className="back-link" onClick={() => { setView("list"); setSelectedProposal(null); }}>
          &larr; All proposals
        </button>

        <div className="process-header">
          <h1>{selectedProposal.title}</h1>
          <span className={`status-badge ${statusClass(selectedProposal.status)}`}>
            {statusLabel(selectedProposal.status)}
          </span>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="process-meta">
          <span>Submitted by {selectedProposal.submitted_by}</span>
          <span>{new Date(selectedProposal.created_at).toLocaleDateString()}</span>
          <span>{selectedProposal.support_count} supporters</span>
        </div>

        {selectedProposal.description && (
          <div className="admin-detail-section">
            <h3>Description</h3>
            <p style={{ whiteSpace: "pre-wrap" }}>{selectedProposal.description}</p>
          </div>
        )}

        {selectedProposal.optional_links.length > 0 && (
          <div className="admin-detail-section">
            <h3>Submitted Links</h3>
            <ul className="admin-links-list">
              {selectedProposal.optional_links.map((link, i) => (
                <li key={i}>
                  <a href={link} target="_blank" rel="noopener noreferrer">{link}</a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="admin-actions">
          {selectedProposal.status !== "archived" && (
            <button
              className="admin-archive-button"
              onClick={() => handleArchive(selectedProposal.id)}
            >
              Archive
            </button>
          )}
        </div>
      </div>
    );
  }

  return null;
}
