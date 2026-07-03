import { useState } from "react";
import { submitInput } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { useRequireAuth } from "../hooks/useRequireAuth";
import { useCommentIdentityMode } from "../hooks/useCommentIdentityMode";
import AuthModal from "./AuthModal";

const COMMENT_MAX = 500;

interface Props {
  proposalId: string;
  onCommentAdded: () => void;
}

export default function ProposalCommentForm({ proposalId, onCommentAdded }: Props) {
  const { actorId } = useAuth();
  const { requireAuth, showAuthModal, closeAuthModal, handleAuthComplete } = useRequireAuth();
  const [body, setBody] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const identityMode = useCommentIdentityMode();

  async function doSubmit() {
    if (!actorId || body.trim().length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitInput(
        proposalId,
        body.trim(),
        identityMode === "anonymous_only" || anonymous,
      );
      setBody("");
      setSuccess(true);
      onCommentAdded();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit comment");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    requireAuth(() => doSubmit());
  }

  return (
    <div className="proposal-comment-form">
      {showAuthModal && (
        <AuthModal onComplete={handleAuthComplete} onDismiss={closeAuthModal} />
      )}

      <h3>Add a comment</h3>

      <form onSubmit={handleSubmit}>
        <textarea
          className="vote-comment-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, COMMENT_MAX))}
          placeholder="Share your thoughts on this proposal"
          rows={3}
          maxLength={COMMENT_MAX}
          disabled={submitting}
        />
        {identityMode === "anonymous_optional" && body.trim().length > 0 && (
          <label className="auth-checkbox-label comment-anonymous-toggle">
            <input
              type="checkbox"
              checked={anonymous}
              onChange={(e) => setAnonymous(e.target.checked)}
              disabled={submitting}
            />
            <span>Post my comment anonymously</span>
          </label>
        )}
        <div className="proposal-comment-form-footer">
          <span className="vote-comment-counter">
            {body.length} / {COMMENT_MAX}
          </span>
          <button
            type="submit"
            className="endorse-button"
            disabled={submitting || body.trim().length === 0}
          >
            {submitting ? "Submitting..." : "Submit Comment"}
          </button>
        </div>
      </form>

      {success && <p className="vote-confirmation">Comment submitted.</p>}
      {error && <p className="form-error">{error}</p>}
    </div>
  );
}
