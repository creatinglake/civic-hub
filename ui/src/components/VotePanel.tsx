import { useState } from "react";
import { Link } from "react-router-dom";
import type { VoteState } from "../services/api";
import { submitVote, supportVote, unsupportVote, submitInput } from "../services/api";
import { useRequireAuth } from "../hooks/useRequireAuth";
import AuthModal from "./AuthModal";

const COMMENT_MAX = 500;

interface Props {
  process: VoteState;
  actor: string;
  onVoted: () => void;
}

export default function VotePanel({ process, actor, onVoted }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justVoted, setJustVoted] = useState<string | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [commentSubmitted, setCommentSubmitted] = useState(false);
  const [commentWarning, setCommentWarning] = useState<string | null>(null);
  const { requireAuth, showAuthModal, closeAuthModal, handleAuthComplete } = useRequireAuth();

  const isActive = process.status === "active";
  const isDone = process.status === "closed" || process.status === "finalized";
  const isProposed = process.status === "proposed";
  const isThresholdMet = process.status === "threshold_met";
  const canSeeResults = process.tally !== null;

  async function doVote(option: string) {
    setLoading(true);
    setError(null);
    setCommentWarning(null);
    try {
      const result = await submitVote(process.id, actor, option);
      const receipt = (result.result as Record<string, unknown>)?.receipt_id as string | undefined;
      setJustVoted(option);
      if (receipt) setReceiptId(receipt);

      // If the resident also typed a comment, submit it after the vote
      // succeeds. Parallel data stream via civic.input — a comment failure
      // does NOT roll back the vote; we surface a non-fatal warning instead.
      const trimmed = comment.trim();
      if (trimmed.length > 0) {
        try {
          await submitInput(process.id, actor, trimmed);
          setCommentSubmitted(true);
          setComment("");
        } catch (commentErr) {
          const msg = commentErr instanceof Error ? commentErr.message : "Failed to submit comment";
          setCommentWarning(
            `Your vote was recorded, but the comment couldn't be saved: ${msg}`,
          );
        }
      }

      onVoted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vote failed");
    } finally {
      setLoading(false);
    }
  }

  function handleVote(option: string) {
    requireAuth(() => doVote(option));
  }

  async function doSupport() {
    setLoading(true);
    setError(null);
    try {
      await supportVote(process.id, actor);
      onVoted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Support failed");
    } finally {
      setLoading(false);
    }
  }

  function handleSupport() {
    requireAuth(() => doSupport());
  }

  async function handleUnsupport() {
    setLoading(true);
    setError(null);
    try {
      await unsupportVote(process.id, actor);
      onVoted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove endorsement");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="vote-panel">
      {showAuthModal && (
        <AuthModal onComplete={handleAuthComplete} onDismiss={closeAuthModal} />
      )}

      {/* Proposal/support phase */}
      {(isProposed || isThresholdMet) && (
        <div className="proposal-endorsement">
          <h4>Endorsements</h4>
          <div className="proposal-progress">
            <div className="proposal-progress-track">
              <div
                className="proposal-progress-fill"
                style={{ width: `${Math.min(100, Math.round((process.support_count / process.support_threshold) * 100))}%` }}
              />
            </div>
            <span className="proposal-progress-label">
              {process.support_count} of {process.support_threshold} endorsements
            </span>
          </div>
          {isProposed && (
            <>
              <p className="proposal-needs">
                Needs {process.support_threshold - process.support_count} more endorsement{process.support_threshold - process.support_count !== 1 ? "s" : ""} to proceed to an official vote
              </p>
              {process.has_supported ? (
                <div className="endorsement-actions">
                  <p className="endorse-confirmation">You endorsed this proposal</p>
                  <button
                    className="unendorse-button"
                    onClick={handleUnsupport}
                    disabled={loading}
                  >
                    {loading ? "Removing..." : "Remove Endorsement"}
                  </button>
                </div>
              ) : (
                <button
                  className="endorse-button"
                  onClick={handleSupport}
                  disabled={loading}
                >
                  {loading ? "Endorsing..." : "Endorse Proposal"}
                </button>
              )}
            </>
          )}
          {isThresholdMet && (
            <p className="proposal-needs">Threshold reached — awaiting activation</p>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {/* Draft state */}
      {process.status === "draft" && (
        <div className="vote-options">
          <h4>Draft</h4>
          <p>This process is still being configured.</p>
        </div>
      )}

      {/* Active voting */}
      {isActive && (
        <div className="vote-options">
          <h4>Cast your vote</h4>
          <p className="vote-privacy-notice">Votes are private. Only total results are shown.</p>

          {!justVoted && (
            <div className="vote-comment-field">
              <label className="vote-comment-label" htmlFor="vote-comment">
                Your comment <span className="vote-comment-optional">(optional)</span>
              </label>
              <textarea
                id="vote-comment"
                className="vote-comment-textarea"
                value={comment}
                onChange={(e) => setComment(e.target.value.slice(0, COMMENT_MAX))}
                placeholder="Share concerns, suggestions, context, or any thoughts worth passing on to the Board. Submitted when you cast your vote."
                rows={3}
                maxLength={COMMENT_MAX}
                disabled={loading}
              />
              <span className="vote-comment-counter">
                {comment.length} / {COMMENT_MAX}
              </span>
            </div>
          )}

          <div className="vote-buttons">
            {process.options.map((option) => (
              <button
                key={option}
                className={`vote-button ${justVoted === option ? "voted" : ""}`}
                onClick={() => handleVote(option)}
                disabled={loading}
              >
                {option}
              </button>
            ))}
          </div>
          {justVoted && commentSubmitted && (
            <p className="vote-confirmation">
              Your vote and comment have been submitted.
            </p>
          )}
          {commentWarning && (
            <p className="vote-comment-warning">{commentWarning}</p>
          )}
          {justVoted && (
            <div className="vote-receipt">
              <p className="vote-receipt-title">Your vote has been recorded</p>
              <p className="vote-receipt-explanation">
                This is your anonymous vote receipt. You can use it to verify that
                your vote was included in the final results. Your identity is not
                associated with this receipt.
              </p>
              {receiptId && (
                <>
                  <p className="vote-receipt-id">Your receipt: <code>{receiptId}</code></p>
                  <Link
                    to={`/votes/${process.id}/log?receipt=${encodeURIComponent(receiptId)}`}
                    className="vote-receipt-verify-link"
                  >
                    Verify my vote
                  </Link>
                </>
              )}
            </div>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      )}

      {/* Closed / finalized voting */}
      {isDone && (
        <div className="vote-options">
          <h4>{process.status === "finalized" ? "Voting finalized" : "Voting closed"}</h4>
        </div>
      )}

      {/* View Vote Log — only shown when vote is closed or finalized */}
      {isDone && (
        <div className="vote-log-link-section">
          <Link to={`/votes/${process.id}/log`} className="vote-log-link-button">
            View Vote Log
          </Link>
        </div>
      )}

      {/* Results — visible after voting, when closed, or finalized */}
      {(isActive || isDone) && (
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
      )}
    </div>
  );
}
