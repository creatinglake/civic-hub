import { useCallback, useRef } from "react";
import type { VoteDraft, DraftSuggestion } from "../services/api";
import "./VoteDraftingForm.css";

interface Props {
  draft: VoteDraft;
  onFieldChange: (field: string, value: string) => void;
  onDurationChange: (ms: number) => void;
  onReview: () => void;
  onSubmit: () => void;
  disabled: boolean;
  reviewLoading?: boolean;
}

const DURATION_OPTIONS = [
  { label: "2 weeks", ms: 14 * 24 * 60 * 60 * 1000 },
  { label: "1 month", ms: 30 * 24 * 60 * 60 * 1000 },
  { label: "2 months", ms: 60 * 24 * 60 * 60 * 1000 },
  { label: "3 months", ms: 90 * 24 * 60 * 60 * 1000 },
];

const PLACEHOLDERS = {
  title: "e.g., Should Floyd County add sidewalks on Main Street between First and Third?",
  description:
    "Give voters the context they need — what's the current situation, who's affected, and why this matters.",
  sources: "Links to relevant information, one per line (optional)",
};

function getStatusText(draft: VoteDraft): string {
  if (!draft.title.trim()) {
    return "Status: Title is required";
  }

  if (draft.last_review_result === null) {
    return "Status: Click Review draft to prepare for submission";
  }

  if (draft.draft_modified_since_review) {
    return "Status: Draft changed — click Review draft before submitting";
  }

  const hardBlocks = (draft.last_review_result ?? []).filter(
    (s: DraftSuggestion) => s.severity === "hard",
  );
  if (hardBlocks.length > 0) {
    return `Status: ${hardBlocks.length} Code of Conduct concern${hardBlocks.length > 1 ? "s" : ""} to resolve`;
  }

  return "Status: Ready to submit";
}

function getStatusClass(draft: VoteDraft): string {
  if (!draft.title.trim()) return "status-missing";
  if (draft.last_review_result === null) return "status-pending";
  if (draft.draft_modified_since_review) return "status-modified";
  const hasHard = (draft.last_review_result ?? []).some(
    (s: DraftSuggestion) => s.severity === "hard",
  );
  if (hasHard) return "status-blocked";
  return "status-ready";
}

export default function VoteDraftingForm({
  draft,
  onFieldChange,
  onDurationChange,
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

  const canSubmit =
    draft.title.trim() &&
    draft.last_review_result !== null &&
    !draft.draft_modified_since_review &&
    !(draft.last_review_result ?? []).some((s: DraftSuggestion) => s.severity === "hard") &&
    !disabled;

  return (
    <div className="drafting-form">
      <div className="drafting-form-scroll">
        <div className="form-field">
          <label htmlFor="draft-title" className="form-label">
            Vote question <span className="required">*</span>
          </label>
          <input
            id="draft-title"
            type="text"
            className="form-input"
            defaultValue={draft.title}
            onChange={handleChange("title")}
            placeholder={PLACEHOLDERS.title}
            maxLength={200}
            disabled={disabled}
          />
        </div>

        <div className="form-field">
          <label htmlFor="draft-description" className="form-label">
            Context for voters <span className="optional">(optional)</span>
          </label>
          <textarea
            id="draft-description"
            className="form-textarea"
            defaultValue={draft.description}
            onChange={handleChange("description")}
            placeholder={PLACEHOLDERS.description}
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
            placeholder={PLACEHOLDERS.sources}
            rows={2}
            disabled={disabled}
          />
          <p className="form-hint">Add relevant links, one per line.</p>
        </div>

        <div className="form-field">
          <label htmlFor="draft-duration" className="form-label">
            How long should voting stay open?
          </label>
          <select
            id="draft-duration"
            className="form-select"
            value={draft.voting_duration_ms}
            onChange={(e) => onDurationChange(Number(e.target.value))}
            disabled={disabled}
          >
            {DURATION_OPTIONS.map((opt) => (
              <option key={opt.ms} value={opt.ms}>
                {opt.label}
              </option>
            ))}
          </select>
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
            Submit vote
          </button>
        </div>
      </div>
    </div>
  );
}
