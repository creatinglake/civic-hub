import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { submitProposal } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useRequireAuth } from "../hooks/useRequireAuth";
import AuthModal from "../components/AuthModal";
import hub from "../config/hub";

export default function Propose() {
  const navigate = useNavigate();
  const { actorId, canParticipate } = useAuth();
  const { requireAuth, showAuthModal, closeAuthModal, handleAuthComplete } = useRequireAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [links, setLinks] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doSubmit() {
    if (!actorId) return;
    setError(null);
    setSubmitting(true);
    try {
      const optionalLinks = links
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0);

      await submitProposal(
        title.trim(),
        actorId,
        description.trim() || undefined,
        optionalLinks.length > 0 ? optionalLinks : undefined
      );

      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit proposal");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    requireAuth(() => doSubmit());
  }

  return (
    <div className="page detail-page">
      {showAuthModal && (
        <AuthModal onComplete={handleAuthComplete} onDismiss={closeAuthModal} />
      )}

      <Link to="/" className="back-link">&larr; Home</Link>

      <h1>Suggest a vote</h1>
      <p className="propose-description">
        Submit an idea for the community to consider. With enough
        citizen support — your neighbors endorsing it — your suggestion
        is reviewed and may become an official {hub.jurisdiction} advisory
        vote.
      </p>

      {!canParticipate && (
        <p className="auth-prompt-inline">
          You'll need to create an account before submitting.
        </p>
      )}

      <form className="propose-form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="proposal-title" className="form-label">
            Title <span className="required">*</span>
          </label>
          <input
            id="proposal-title"
            type="text"
            className="form-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Should the county add sidewalks on Main Street?"
            maxLength={200}
            disabled={submitting}
          />
        </div>

        <div className="form-field">
          <label htmlFor="proposal-description" className="form-label">
            Description <span className="optional">(optional)</span>
          </label>
          <textarea
            id="proposal-description"
            className="form-textarea"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Provide any additional context about your proposal..."
            rows={4}
            disabled={submitting}
          />
        </div>

        <div className="form-field">
          <label htmlFor="proposal-links" className="form-label">
            Links <span className="optional">(optional)</span>
          </label>
          <textarea
            id="proposal-links"
            className="form-textarea form-textarea-small"
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            placeholder="One URL per line (e.g., news articles, official documents)"
            rows={2}
            disabled={submitting}
          />
          <p className="form-hint">Add relevant links, one per line.</p>
        </div>

        {error && <p className="form-error">{error}</p>}

        <button
          type="submit"
          className="propose-submit-button"
          disabled={submitting || !title.trim()}
        >
          {submitting ? "Submitting..." : "Submit suggestion"}
        </button>
      </form>
    </div>
  );
}
