import { useState } from "react";
import "./StatementSubmission.css";

interface Props {
  onSubmit: (text: string) => Promise<void>;
}

const MAX_CHARS = 280;

export default function StatementSubmission({ onSubmit }: Props) {
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const remaining = MAX_CHARS - text.length;

  async function handleSubmit() {
    if (!text.trim() || submitting) return;
    setSubmitting(true);
    try {
      await onSubmit(text.trim());
      setText("");
      setSubmitted(true);
      setTimeout(() => setSubmitted(false), 3000);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="statement-submission">
      <h4 className="statement-submission-title">Add your perspective</h4>
      <textarea
        className="statement-submission-input"
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
        placeholder="Write a short statement for others to vote on..."
        rows={3}
        disabled={submitting}
      />
      <div className="statement-submission-footer">
        <span className={`char-count ${remaining < 20 ? "char-count--low" : ""}`}>
          {remaining} characters remaining
        </span>
        <button
          className="statement-submit-btn"
          onClick={handleSubmit}
          disabled={!text.trim() || submitting}
        >
          {submitting ? "Submitting..." : "Submit Statement"}
        </button>
      </div>
      {submitted && (
        <p className="statement-submitted-msg">
          Statement submitted. It may be moderated before appearing.
        </p>
      )}
    </div>
  );
}
