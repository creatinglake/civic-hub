// CommunityInputPanel — renders community input submission and display.
//
// Community input is stored separately from votes and does NOT affect
// vote tallying or lifecycle transitions. This is an explicit design guardrail.

import { useState, useEffect, useCallback } from "react";
import type { CommunityInput, CommunityInputConfig } from "../services/api";
import { getInputs, submitInput } from "../services/api";

interface Props {
  processId: string;
  actor: string;
  config?: CommunityInputConfig;
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function CommunityInputPanel({ processId, actor, config }: Props) {
  const [inputs, setInputs] = useState<CommunityInput[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const fetchInputs = useCallback(() => {
    getInputs(processId)
      .then(setInputs)
      .catch(() => {/* silent — inputs are non-critical */});
  }, [processId]);

  useEffect(() => {
    fetchInputs();
  }, [fetchInputs]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;

    setLoading(true);
    setError(null);
    try {
      await submitInput(processId, actor, body.trim());
      setBody("");
      setSubmitted(true);
      fetchInputs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit");
    } finally {
      setLoading(false);
    }
  }

  const prompt = config?.prompt ?? "Share your perspective on this issue";
  const label = config?.label ?? "Optional: Your input does not affect vote results";

  return (
    <div className="community-input-panel">
      <h3>Community input</h3>
      <p className="input-label">{label}</p>

      {/* Submission form */}
      <form className="input-form" onSubmit={handleSubmit}>
        <textarea
          className="input-textarea"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={prompt}
          rows={3}
          disabled={loading}
        />
        <div className="input-form-actions">
          <button
            type="submit"
            className="input-submit-button"
            disabled={loading || !body.trim()}
          >
            {loading ? "Submitting..." : "Submit"}
          </button>
          {submitted && <span className="input-confirmation">Thank you for sharing your perspective</span>}
          {error && <span className="error">{error}</span>}
        </div>
      </form>

      {/* Existing inputs */}
      {inputs.length > 0 && (
        <div className="input-list">
          <p className="input-count">{inputs.length} response{inputs.length !== 1 ? "s" : ""}</p>
          {inputs.map((input) => (
            <div key={input.id} className="input-item">
              <p className="input-body">{input.body}</p>
              <span className="input-meta">
                {input.author_id} &middot; {formatRelativeTime(input.submitted_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
