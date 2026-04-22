import { useEffect, useState } from "react";
import {
  adminListProposals,
  adminGetProposal,
  convertProposal,
  archiveProposal as apiArchiveProposal,
  type CivicProposalSummary,
  type CivicProposalDetail,
  type ContentSection,
  type ContentLink,
} from "../services/api";
import AdminTabs from "../components/AdminTabs";

const ADMIN_USER = "user:civic-admin";

type View = "list" | "detail" | "review";

export default function AdminProposals() {
  const [view, setView] = useState<View>("list");
  const [proposals, setProposals] = useState<CivicProposalSummary[]>([]);
  const [selectedProposal, setSelectedProposal] = useState<CivicProposalDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  // Review form state
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewQuestion, setReviewQuestion] = useState("");
  const [reviewOptions, setReviewOptions] = useState("Yes\nNo");
  const [reviewSections, setReviewSections] = useState<{ title: string; body: string }[]>([
    { title: "What is this about?", body: "" },
    { title: "Why does this matter?", body: "" },
    { title: "Concerns raised", body: "" },
    { title: "Local context", body: "" },
  ]);
  const [reviewTradeoff, setReviewTradeoff] = useState("");
  const [reviewLinks, setReviewLinks] = useState("");
  const [reviewJurisdiction, setReviewJurisdiction] = useState("us-va-floyd");
  const [converting, setConverting] = useState(false);

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

  function openReview() {
    if (!selectedProposal) return;
    // Prefill review form from the proposal
    setReviewTitle(selectedProposal.title);
    setReviewQuestion(selectedProposal.title);
    setReviewOptions("Yes\nNo");
    setReviewSections([
      { title: "What is this about?", body: selectedProposal.description || "" },
      { title: "Why does this matter?", body: "" },
      { title: "Concerns raised", body: "" },
      { title: "Local context", body: "" },
    ]);
    setReviewTradeoff("");
    setReviewLinks(
      selectedProposal.optional_links?.join("\n") ?? ""
    );
    setReviewJurisdiction("us-va-floyd");
    setView("review");
  }

  async function handleConvert() {
    if (!selectedProposal) return;
    setConverting(true);
    setError(null);

    try {
      const options = reviewOptions
        .split("\n")
        .map((o) => o.trim())
        .filter((o) => o.length > 0);

      const sections: ContentSection[] = reviewSections
        .filter((s) => s.body.trim().length > 0)
        .map((s) => ({
          title: s.title,
          body: s.body.includes("\n")
            ? s.body.split("\n").map((l) => l.trim()).filter((l) => l.length > 0)
            : s.body.trim(),
        }));

      const links: ContentLink[] = reviewLinks
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0)
        .map((url) => ({ label: url, url }));

      const result = await convertProposal(selectedProposal.id, {
        actor: ADMIN_USER,
        title: reviewTitle.trim() || undefined,
        question: reviewQuestion.trim() || undefined,
        options: options.length > 0 ? options : undefined,
        sections: sections.length > 0 ? sections : undefined,
        key_tradeoff: reviewTradeoff.trim() || undefined,
        learn_more_links: links.length > 0 ? links : undefined,
        jurisdiction: reviewJurisdiction || undefined,
      });

      setActionMessage(
        `Converted! Vote created: "${result.vote_process.title}" (${result.vote_process.id})`
      );
      setView("list");
      setSelectedProposal(null);
      loadProposals();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Conversion failed");
    } finally {
      setConverting(false);
    }
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

  function updateSection(index: number, field: "title" | "body", value: string) {
    setReviewSections((prev) =>
      prev.map((s, i) => (i === index ? { ...s, [field]: value } : s))
    );
  }

  function addSection() {
    setReviewSections((prev) => [...prev, { title: "", body: "" }]);
  }

  function removeSection(index: number) {
    setReviewSections((prev) => prev.filter((_, i) => i !== index));
  }

  function statusLabel(status: string): string {
    switch (status) {
      case "submitted": return "Submitted";
      case "endorsed": return "Endorsed";
      case "converted": return "Converted";
      case "archived": return "Archived";
      default: return status;
    }
  }

  function statusClass(status: string): string {
    switch (status) {
      case "endorsed": return "admin-status-endorsed";
      case "submitted": return "admin-status-submitted";
      case "converted": return "admin-status-converted";
      case "archived": return "admin-status-archived";
      default: return "";
    }
  }

  // --- LIST VIEW ---
  if (view === "list") {
    return (
      <div className="page detail-page admin-page">
        <AdminTabs />
        <h1>Admin: Proposal Review</h1>
        <p className="admin-subtitle">
          Endorsed proposals need review. Convert them to official votes or archive them.
        </p>

        {actionMessage && <p className="admin-action-message">{actionMessage}</p>}
        {error && <p className="form-error">{error}</p>}
        {loading && <p>Loading...</p>}

        {!loading && proposals.length === 0 && (
          <p className="empty-state-inline">No proposals to review.</p>
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
                  <span>{p.support_count} endorsement{p.support_count !== 1 ? "s" : ""}</span>
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
          <span>
            {selectedProposal.support_count} / {selectedProposal.support_threshold} endorsements
          </span>
        </div>

        {selectedProposal.description && (
          <div className="admin-detail-section">
            <h3>Description</h3>
            <p>{selectedProposal.description}</p>
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
          {selectedProposal.status === "endorsed" && (
            <button className="admin-convert-button" onClick={openReview}>
              Review &amp; Convert to Vote
            </button>
          )}
          {(selectedProposal.status === "submitted" || selectedProposal.status === "endorsed") && (
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

  // --- REVIEW / CONVERT VIEW ---
  if (view === "review" && selectedProposal) {
    return (
      <div className="page detail-page admin-page">
        <button className="back-link" onClick={() => setView("detail")}>
          &larr; Back to proposal
        </button>

        <h1>Convert to Vote</h1>
        <p className="admin-subtitle">
          Curate the proposal into a structured civic vote. Edit and refine the fields below.
        </p>

        {error && <p className="form-error">{error}</p>}

        <div className="admin-review-form">
          <div className="form-field">
            <label className="form-label">Vote Title</label>
            <input
              type="text"
              className="form-input"
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
              disabled={converting}
            />
          </div>

          <div className="form-field">
            <label className="form-label">Core Question</label>
            <input
              type="text"
              className="form-input"
              value={reviewQuestion}
              onChange={(e) => setReviewQuestion(e.target.value)}
              placeholder="The question voters will answer"
              disabled={converting}
            />
          </div>

          <div className="form-field">
            <label className="form-label">Voting Options</label>
            <textarea
              className="form-textarea form-textarea-small"
              value={reviewOptions}
              onChange={(e) => setReviewOptions(e.target.value)}
              placeholder="One option per line"
              rows={3}
              disabled={converting}
            />
            <p className="form-hint">One option per line.</p>
          </div>

          <div className="form-field">
            <label className="form-label">Jurisdiction</label>
            <input
              type="text"
              className="form-input"
              value={reviewJurisdiction}
              onChange={(e) => setReviewJurisdiction(e.target.value)}
              disabled={converting}
            />
          </div>

          <div className="form-field">
            <label className="form-label">Key Tradeoff</label>
            <input
              type="text"
              className="form-input"
              value={reviewTradeoff}
              onChange={(e) => setReviewTradeoff(e.target.value)}
              placeholder="e.g., Public safety vs. privacy"
              disabled={converting}
            />
          </div>

          <div className="admin-sections">
            <label className="form-label">Context Sections</label>
            {reviewSections.map((section, i) => (
              <div key={i} className="admin-section-editor">
                <div className="admin-section-header">
                  <input
                    type="text"
                    className="form-input form-input-small"
                    value={section.title}
                    onChange={(e) => updateSection(i, "title", e.target.value)}
                    placeholder="Section title"
                    disabled={converting}
                  />
                  <button
                    type="button"
                    className="admin-remove-section"
                    onClick={() => removeSection(i)}
                    disabled={converting}
                    title="Remove section"
                  >
                    &times;
                  </button>
                </div>
                <textarea
                  className="form-textarea"
                  value={section.body}
                  onChange={(e) => updateSection(i, "body", e.target.value)}
                  placeholder="Section content (use one item per line for bullet points)"
                  rows={3}
                  disabled={converting}
                />
              </div>
            ))}
            <button
              type="button"
              className="admin-add-section"
              onClick={addSection}
              disabled={converting}
            >
              + Add Section
            </button>
          </div>

          <div className="form-field">
            <label className="form-label">Learn More Links</label>
            <textarea
              className="form-textarea form-textarea-small"
              value={reviewLinks}
              onChange={(e) => setReviewLinks(e.target.value)}
              placeholder="One URL per line"
              rows={3}
              disabled={converting}
            />
            <p className="form-hint">One URL per line. Links from the original submission are prefilled.</p>
          </div>

          <div className="admin-convert-actions">
            <button
              className="admin-convert-button"
              onClick={handleConvert}
              disabled={converting || !reviewTitle.trim()}
            >
              {converting ? "Converting..." : "Convert to Vote"}
            </button>
            <button
              className="admin-cancel-button"
              onClick={() => setView("detail")}
              disabled={converting}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
