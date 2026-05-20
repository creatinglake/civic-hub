import { useCallback, useRef } from "react";
import CategorySelector from "./CategorySelector";
import type { DraftCategory, ProposalDraft } from "../services/api";
import "./DraftingForm.css";

interface Props {
  draft: ProposalDraft;
  onFieldChange: (field: string, value: string) => void;
  onCategoryChange: (category: DraftCategory) => void;
  onReview: () => void;
  onSubmit: () => void;
  onDispute: () => void;
  disabled: boolean;
  reviewLoading?: boolean;
}

const PLACEHOLDERS: Record<string, Record<string, string>> = {
  issue: {
    title: "e.g., Concerns about traffic speed on Route 8 near the high school",
    description:
      "Describe the concern — what you've seen, who's affected, and what you'd want the community to consider.",
    sources: "Link to news articles, official documents, or data that support your concern (one per line)",
    considerations: "What would someone who disagrees say? Any trade-offs to acknowledge?",
  },
  idea: {
    title: "e.g., Start a community garden at the old rec center lot",
    description:
      "What would you like to see happen, and why does it matter to you?",
    sources: "Any relevant links (optional, one per line)",
    considerations: "Who else might want this? Any considerations?",
  },
  project: {
    title: "e.g., Upgrade the Floyd County Library Wi-Fi network",
    description:
      "What do you want to do, who would it serve, and what would it take?",
    sources: "Links to cost estimates, similar projects, or relevant info (one per line)",
    considerations:
      "Who would organize this? What resources would be needed? Any trade-offs?",
  },
};

function getPlaceholder(category: string | null, field: string): string {
  const cat = category ?? "idea";
  return PLACEHOLDERS[cat]?.[field] ?? "";
}

function getStatusText(draft: ProposalDraft): string {
  if (!draft.title.trim() || !draft.category) {
    const missing: string[] = [];
    if (!draft.category) missing.push("category");
    if (!draft.title.trim()) missing.push("title");
    return `${missing.length} required field${missing.length > 1 ? "s" : ""} missing`;
  }

  if (draft.last_review_result === null) {
    return "Review my draft when you're ready";
  }

  if (draft.draft_modified_since_review) {
    return "Draft has changed — Review my draft to update status";
  }

  const hardBlocks = (draft.last_review_result ?? []).filter(
    (s) => s.severity === "hard",
  );
  if (hardBlocks.length > 0) {
    return `${hardBlocks.length} Code of Conduct concern${hardBlocks.length > 1 ? "s" : ""} to resolve`;
  }

  return "Ready to submit";
}

function getStatusClass(draft: ProposalDraft): string {
  if (!draft.title.trim() || !draft.category) return "status-missing";
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
  onCategoryChange,
  onReview,
  onSubmit,
  onDispute,
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

  const canSubmit =
    draft.title.trim() &&
    draft.category &&
    draft.last_review_result !== null &&
    !draft.draft_modified_since_review &&
    !(draft.last_review_result ?? []).some((s) => s.severity === "hard") &&
    !disabled;

  const canDispute =
    draft.title.trim() &&
    draft.category &&
    draft.last_review_result !== null &&
    !draft.draft_modified_since_review &&
    (draft.last_review_result ?? []).some((s) => s.severity === "hard") &&
    !disabled;

  return (
    <div className="drafting-form">
      <div className="drafting-form-scroll">
        <CategorySelector
          value={draft.category}
          onChange={onCategoryChange}
          disabled={disabled}
        />

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
            placeholder={getPlaceholder(draft.category, "title")}
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
            placeholder={getPlaceholder(draft.category, "description")}
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
            placeholder={getPlaceholder(draft.category, "sources")}
            rows={2}
            disabled={disabled}
          />
          <p className="form-hint">Add relevant links, one per line.</p>
        </div>

        {(draft.category === "issue" || draft.category === "project") && (
          <div className="form-field">
            <label htmlFor="draft-considerations" className="form-label">
              Considerations <span className="optional">(optional)</span>
            </label>
            <textarea
              id="draft-considerations"
              className="form-textarea"
              defaultValue={draft.considerations}
              onChange={handleChange("considerations")}
              placeholder={getPlaceholder(draft.category, "considerations")}
              rows={3}
              disabled={disabled}
            />
          </div>
        )}
      </div>

      <div className="drafting-form-footer">
        <div className={`draft-status ${getStatusClass(draft)}`}>
          {getStatusText(draft)}
        </div>

        <div className="draft-actions">
          {draft.title.trim() && draft.category && (draft.last_review_result === null || draft.draft_modified_since_review) && (
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
            Submit suggestion
          </button>
          <button
            type="button"
            className="draft-dispute-btn"
            onClick={onDispute}
            disabled={!canDispute}
          >
            Dispute &amp; send to steward
          </button>
        </div>
      </div>
    </div>
  );
}
