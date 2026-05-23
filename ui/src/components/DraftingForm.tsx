import { useCallback, useRef } from "react";
import type { DraftCategory, ProposalDraft } from "../services/api";
import "./DraftingForm.css";

interface Props {
  draft: ProposalDraft;
  onFieldChange: (field: string, value: string) => void;
  onReview: () => void;
  onSubmit: () => void;
  disabled: boolean;
  reviewLoading?: boolean;
}

const PLACEHOLDERS: Record<string, Record<string, string>> = {
  idea: {
    title: "e.g., Start a community garden at the old rec center lot",
    description:
      "What would you like to see happen, and why does it matter to you?",
    sources: "Any relevant links (optional, one per line)",
  },
  concern: {
    title: "e.g., Traffic speed on Route 8 near the school",
    description:
      "Describe the concern — what you've observed, who's affected, and what the community should consider.",
    sources: "Link to news articles, official documents, or data that support your concern (one per line)",
  },
};

function getPlaceholder(category: string | null, field: string): string {
  const cat = category ?? "idea";
  return PLACEHOLDERS[cat]?.[field] ?? PLACEHOLDERS["idea"]?.[field] ?? "";
}

function getStatusText(draft: ProposalDraft): string {
  if (!draft.title.trim()) {
    return "Status: 1 required field missing";
  }

  if (draft.last_review_result === null) {
    return "Status: Click Review draft to prepare for submission";
  }

  if (draft.draft_modified_since_review) {
    return "Status: Draft changed — click Review draft before submitting";
  }

  const hardBlocks = (draft.last_review_result ?? []).filter(
    (s) => s.severity === "hard",
  );
  if (hardBlocks.length > 0) {
    return `Status: ${hardBlocks.length} Code of Conduct concern${hardBlocks.length > 1 ? "s" : ""} to resolve`;
  }

  return "Status: Ready to submit";
}

function getStatusClass(draft: ProposalDraft): string {
  if (!draft.title.trim()) return "status-missing";
  if (draft.last_review_result === null) return "status-pending";
  if (draft.draft_modified_since_review) return "status-modified";
  const hasHard = (draft.last_review_result ?? []).some(
    (s) => s.severity === "hard",
  );
  if (hasHard) return "status-blocked";
  return "status-ready";
}

export default function DraftingForm({
  draft,
  onFieldChange,
  onReview,
  onSubmit,
  disabled,
  reviewLoading,
}: Props) {
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const handleChange = useCallback(
    (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.target.value;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onFieldChange(field, value);
      }, 800);
    },
    [onFieldChange],
  );

  const handleSubTypeChange = useCallback(
    (cat: DraftCategory) => {
      onFieldChange("category", cat);
    },
    [onFieldChange],
  );

  const subType = draft.category ?? "idea";

  const canSubmit =
    draft.title.trim() &&
    draft.last_review_result !== null &&
    !draft.draft_modified_since_review &&
    !(draft.last_review_result ?? []).some((s) => s.severity === "hard") &&
    !disabled;

  return (
    <div className="drafting-form">
      <div className="drafting-form-scroll">
        <div className="subtype-toggle">
          <button
            type="button"
            className={`subtype-pill${subType === "idea" ? " subtype-pill-active" : ""}`}
            onClick={() => handleSubTypeChange("idea")}
            disabled={disabled}
          >
            Idea
          </button>
          <button
            type="button"
            className={`subtype-pill${subType === "concern" ? " subtype-pill-active" : ""}`}
            onClick={() => handleSubTypeChange("concern")}
            disabled={disabled}
          >
            Concern
          </button>
        </div>

        <div className="form-field">
          <label htmlFor="draft-title" className="form-label">
            Title <span className="required">*</span>
          </label>
          <input
            id="draft-title"
            type="text"
            className="form-input"
            defaultValue={draft.title}
            onChange={handleChange("title")}
            placeholder={getPlaceholder(subType, "title")}
            maxLength={200}
            disabled={disabled}
          />
        </div>

        <div className="form-field">
          <label htmlFor="draft-description" className="form-label">
            Description <span className="optional">(optional)</span>
          </label>
          <textarea
            id="draft-description"
            className="form-textarea"
            defaultValue={draft.description}
            onChange={handleChange("description")}
            placeholder={getPlaceholder(subType, "description")}
            rows={5}
            disabled={disabled}
          />
        </div>

        <div className="form-field">
          <label htmlFor="draft-sources" className="form-label">
            Links / Sources <span className="optional">(optional)</span>
          </label>
          <textarea
            id="draft-sources"
            className="form-textarea form-textarea-small"
            defaultValue={draft.sources}
            onChange={handleChange("sources")}
            placeholder={getPlaceholder(subType, "sources")}
            rows={2}
            disabled={disabled}
          />
          <p className="form-hint">Add relevant links, one per line.</p>
        </div>
      </div>

      <div className="drafting-form-footer">
        <div className={`draft-status ${getStatusClass(draft)}`}>
          {getStatusText(draft)}
        </div>

        <div className="draft-actions">
          {draft.title.trim() && (draft.last_review_result === null || draft.draft_modified_since_review) && (
            <button
              type="button"
              className="draft-review-btn"
              onClick={onReview}
              disabled={disabled || reviewLoading}
            >
              {reviewLoading ? "Reviewing..." : "Review draft"}
            </button>
          )}
          <button
            type="button"
            className="draft-submit-btn"
            onClick={onSubmit}
            disabled={!canSubmit}
          >
            Submit proposal
          </button>
        </div>
      </div>
    </div>
  );
}
