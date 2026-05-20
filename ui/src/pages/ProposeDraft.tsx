import { useState, useCallback, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useRequireAuth } from "../hooks/useRequireAuth";
import AuthModal from "../components/AuthModal";
import AssistantPanel, { type ChatMessage } from "../components/AssistantPanel";
import DraftingForm from "../components/DraftingForm";
import hub from "../config/hub";
import {
  createDraft,
  updateDraft,
  sendAssistantMessage,
  reviewDraft,
  submitDraft as apiSubmitDraft,
  type DraftCategory,
  type ProposalDraft,
  type DraftSuggestion,
} from "../services/api";
import "./ProposeDraft.css";

type Step = "category" | "path" | "drafting";

function friendlyError(msg: string): string {
  if (msg.includes("rate_limit") || msg.includes("429"))
    return "The assistant is getting too many requests right now. Wait a moment and try again.";
  if (msg.includes("ANTHROPIC_API_KEY"))
    return "The assistant isn't configured yet. Please contact the hub admin.";
  if (msg.includes("timeout") || msg.includes("aborted"))
    return "The assistant took too long to respond. Try again with a shorter message.";
  return "Something went wrong with the assistant. Try again in a moment.";
}

export default function ProposeDraft() {
  const navigate = useNavigate();
  const { canParticipate } = useAuth();
  const { requireAuth, showAuthModal, closeAuthModal, handleAuthComplete } =
    useRequireAuth();

  const [step, setStep] = useState<Step>("category");
  const [category, setCategory] = useState<DraftCategory | null>(null);
  const [draft, setDraft] = useState<ProposalDraft | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showMobileAssistant, setShowMobileAssistant] = useState(false);
  const [phase, setPhase] = useState<"brainstorm" | "free_form" | "review">("brainstorm");
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const isMobile = useIsMobile();

  function handleCategorySelect(cat: DraftCategory) {
    setCategory(cat);
    setStep("path");
  }

  async function startDraft(path: "brainstorm" | "write") {
    requireAuth(async () => {
      setLoading(true);
      setError(null);
      try {
        const d = await createDraft(category!);
        setDraft(d);
        setStep("drafting");

        if (path === "brainstorm") {
          setPhase("brainstorm");
          const greeting =
            "Want to think through this together first, or do you want to write your own draft and I'll review it?";
          setMessages([
            { role: "assistant", content: greeting },
          ]);

          const result = await sendAssistantMessage(
            d.id,
            "brainstorm",
            `I want to brainstorm a proposal. I've selected the "${category}" category.`,
          );
          setDraft(result.draft);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: result.response.message,
              suggestions:
                result.response.suggestions.length > 0
                  ? result.response.suggestions
                  : undefined,
            },
          ]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create draft");
      } finally {
        setLoading(false);
      }
    });
  }

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!draft) return;
      setLoading(true);
      setError(null);
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      try {
        const result = await sendAssistantMessage(draft.id, phase, text);
        setDraft(result.draft);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: result.response.message,
            suggestions:
              result.response.suggestions.length > 0
                ? result.response.suggestions
                : undefined,
          },
        ]);

        if (result.response.draft_proposal) {
          setDraft(result.draft);
          setPhase("free_form");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: friendlyError(msg) },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [draft, phase],
  );

  const handleReview = useCallback(async () => {
    if (!draft) return;
    setLoading(true);
    setError(null);
    try {
      const result = await reviewDraft(draft.id);
      setDraft(result.draft);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: result.response.message,
          suggestions:
            result.response.suggestions.length > 0
              ? result.response.suggestions
              : undefined,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: friendlyError(msg) },
      ]);
    } finally {
      setLoading(false);
    }
  }, [draft]);

  const handleFieldChange = useCallback(
    async (field: string, value: string) => {
      if (!draft) return;
      try {
        const updated = await updateDraft(draft.id, { [field]: value });
        setDraft(updated);
      } catch {
        // silent — field saves are best-effort
      }
    },
    [draft],
  );

  const handleCategoryChange = useCallback(
    async (cat: DraftCategory) => {
      if (!draft) return;
      setCategory(cat);
      try {
        const updated = await updateDraft(draft.id, { category: cat });
        setDraft(updated);
      } catch {
        // silent
      }
    },
    [draft],
  );

  const handleApplySuggestion = useCallback(
    (suggestion: DraftSuggestion) => {
      if (!draft || !suggestion.field || !suggestion.suggested_revision) return;

      const field = suggestion.field as keyof typeof draft;
      const current = String(draft[field] ?? "");
      let newValue: string;

      if (suggestion.quoted_text && current.includes(suggestion.quoted_text)) {
        newValue = current.replace(suggestion.quoted_text, suggestion.suggested_revision);
      } else if (current.trim()) {
        newValue = current.trim() + "\n\n" + suggestion.suggested_revision;
      } else {
        newValue = suggestion.suggested_revision;
      }

      handleFieldChange(suggestion.field, newValue);

      const inputId = `draft-${suggestion.field}`;
      const el = document.getElementById(inputId) as
        | HTMLInputElement
        | HTMLTextAreaElement
        | null;
      if (el) el.value = newValue;
    },
    [draft, handleFieldChange],
  );

  async function handleSubmit() {
    setShowConfirm(true);
  }

  async function confirmSubmit() {
    if (!draft) return;
    setSubmitting(true);
    setError(null);
    try {
      await apiSubmitDraft(draft.id);
      navigate("/votes");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit failed");
    } finally {
      setSubmitting(false);
      setShowConfirm(false);
    }
  }

  // --- Render ---

  if (step === "category") {
    return (
      <div className="page detail-page">
        {showAuthModal && (
          <AuthModal
            onComplete={handleAuthComplete}
            onDismiss={closeAuthModal}
          />
        )}
        <Link to="/" className="back-link">
          &larr; Home
        </Link>
        <h1>Suggest a vote</h1>
        <p className="propose-description">
          Submit an idea for the community to consider. With enough citizen
          support — your neighbors endorsing it — your suggestion is reviewed and
          may become an official {hub.jurisdiction} advisory vote.
        </p>

        {!canParticipate && (
          <p className="auth-prompt-inline">
            You'll need to create an account before submitting.
          </p>
        )}

        <h2 className="propose-step-heading">What kind of proposal is this?</h2>

        <fieldset className="category-selector" style={{ border: "none", padding: 0 }}>
          <div className="category-cards">
            {([
              {
                value: "issue" as const,
                label: "Issue",
                desc: "A concern, problem, or factual matter you want the community to consider.",
              },
              {
                value: "idea" as const,
                label: "Idea",
                desc: "A preference or aspiration — something you'd like to see happen.",
              },
              {
                value: "project" as const,
                label: "Project",
                desc: "A concrete initiative you or someone else could organize.",
              },
            ]).map((cat) => (
              <button
                key={cat.value}
                type="button"
                className={`category-card${category === cat.value ? " selected" : ""}`}
                onClick={() => handleCategorySelect(cat.value)}
              >
                <span className="category-card-label">{cat.label}</span>
                <span className="category-card-desc">{cat.desc}</span>
              </button>
            ))}
          </div>
        </fieldset>
      </div>
    );
  }

  if (step === "path") {
    return (
      <div className="page detail-page">
        {showAuthModal && (
          <AuthModal
            onComplete={handleAuthComplete}
            onDismiss={closeAuthModal}
          />
        )}
        <Link to="/" className="back-link">
          &larr; Home
        </Link>
        <h1>Suggest a vote</h1>
        <p className="propose-description">
          How would you like to start your{" "}
          <strong>{category}</strong> proposal?
        </p>

        {error && <p className="form-error">{error}</p>}

        <div className="path-choice">
          <button
            type="button"
            className="path-card"
            onClick={() => startDraft("brainstorm")}
            disabled={loading}
          >
            <span className="path-card-label">Let's brainstorm together</span>
            <span className="path-card-desc">
              The assistant will ask a few questions to help shape your
              proposal, then offer to generate a starting draft.
            </span>
          </button>

          <button
            type="button"
            className="path-card"
            onClick={() => startDraft("write")}
            disabled={loading}
          >
            <span className="path-card-label">I'll write my own</span>
            <span className="path-card-desc">
              Jump straight to the form. The assistant is available if you
              want feedback.
            </span>
          </button>
        </div>

        <button
          type="button"
          className="path-back-link"
          onClick={() => setStep("category")}
        >
          &larr; Change category
        </button>
      </div>
    );
  }

  // step === "drafting"
  if (!draft) return null;

  const assistantPanel = (
    <AssistantPanel
      messages={messages}
      onSendMessage={handleSendMessage}
      onApplySuggestion={handleApplySuggestion}
      loading={loading}
      phase={phase}
    />
  );

  return (
    <div className="propose-draft-page">
      {showAuthModal && (
        <AuthModal
          onComplete={handleAuthComplete}
          onDismiss={closeAuthModal}
        />
      )}

      {/* Desktop two-pane */}
      {!isMobile && (
        <div className="propose-draft-layout">
          <div className="propose-draft-assistant">{assistantPanel}</div>
          <div className="propose-draft-form">
            <div className="propose-draft-form-header">
              <Link to="/" className="back-link">
                &larr; Home
              </Link>
              <h1 className="propose-draft-title">Suggest a vote</h1>
            </div>
            {error && <p className="form-error" style={{ padding: "0 var(--space-lg)" }}>{error}</p>}
            <DraftingForm
              draft={draft}
              onFieldChange={handleFieldChange}
              onCategoryChange={handleCategoryChange}
              onReview={handleReview}
              onSubmit={handleSubmit}
              onDispute={() => {}}
              disabled={submitting}
              reviewLoading={loading}
            />
          </div>
        </div>
      )}

      {/* Mobile single-pane */}
      {isMobile && (
        <>
          <div className="page detail-page">
            <Link to="/" className="back-link">
              &larr; Home
            </Link>
            <h1>Suggest a vote</h1>
            {error && <p className="form-error">{error}</p>}
            <DraftingForm
              draft={draft}
              onFieldChange={handleFieldChange}
              onCategoryChange={handleCategoryChange}
              onReview={handleReview}
              onSubmit={handleSubmit}
              onDispute={() => {}}
              disabled={submitting}
              reviewLoading={loading}
            />
          </div>

          <button
            type="button"
            className="assistant-fab"
            onClick={() => setShowMobileAssistant(true)}
            aria-label="Open drafting assistant"
          >
            ?
          </button>

          {showMobileAssistant && (
            <div className="assistant-overlay">
              <div className="assistant-header" style={{ display: "flex", justifyContent: "space-between" }}>
                <h3 className="assistant-title">Drafting assistant</h3>
                <button
                  type="button"
                  className="assistant-close-btn"
                  onClick={() => setShowMobileAssistant(false)}
                  aria-label="Close assistant"
                >
                  &times;
                </button>
              </div>
              {assistantPanel}
            </div>
          )}
        </>
      )}

      {/* Submit confirmation modal */}
      {showConfirm && (
        <div className="intro-overlay" onClick={() => setShowConfirm(false)}>
          <div
            className="intro-modal"
            role="dialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="intro-close"
              onClick={() => setShowConfirm(false)}
            >
              &times;
            </button>
            <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "var(--font-size-xl)", marginBottom: "var(--space-md)" }}>
              Submit your proposal
            </h2>
            <div className="confirm-preview">
              <h3 className="confirm-title">{draft.title}</h3>
              {draft.description && (
                <p className="confirm-desc">{draft.description}</p>
              )}
            </div>

            {draft.assistant_helped && (
              <p className="confirm-disclosure">
                This proposal was drafted with AI assistant help. You are
                responsible for the content. Voters will see a small
                "drafted with assistant help" note.
              </p>
            )}

            {draft.last_review_result &&
              draft.last_review_result.filter((s) => s.severity === "soft")
                .length > 0 && (
                <p className="confirm-soft-note">
                  {
                    draft.last_review_result.filter(
                      (s) => s.severity === "soft",
                    ).length
                  }{" "}
                  suggestion
                  {draft.last_review_result.filter(
                    (s) => s.severity === "soft",
                  ).length > 1
                    ? "s"
                    : ""}{" "}
                  not addressed (these are optional).
                </p>
              )}

            <div className="confirm-actions">
              <button
                type="button"
                className="draft-submit-btn"
                onClick={confirmSubmit}
                disabled={submitting}
              >
                {submitting ? "Submitting..." : "Submit suggestion"}
              </button>
              <button
                type="button"
                className="draft-dispute-btn"
                onClick={() => setShowConfirm(false)}
                disabled={submitting}
              >
                Go back to draft
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 769 : false,
  );

  useEffect(() => {
    function handleResize() {
      setIsMobile(window.innerWidth < 769);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return isMobile;
}
