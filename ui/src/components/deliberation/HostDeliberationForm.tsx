import { useState } from "react";
import { createDeliberation } from "../../services/api";
import "./HostDeliberationForm.css";

interface Props {
  onCreated: () => void;
  onCancel: () => void;
}

export default function HostDeliberationForm({ onCreated, onCancel }: Props) {
  const [topic, setTopic] = useState("");
  const [framing, setFraming] = useState("");
  const [deadline, setDeadline] = useState("");
  const [threshold, setThreshold] = useState("");
  const [seedStatements, setSeedStatements] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!topic.trim() || !framing.trim()) return;

    setSubmitting(true);
    setError(null);

    try {
      const seeds = seedStatements
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      await createDeliberation({
        topic: topic.trim(),
        framing: framing.trim(),
        ...(deadline ? { deadline: new Date(deadline).toISOString() } : {}),
        ...(threshold ? { participation_threshold: parseInt(threshold, 10) } : {}),
        ...(seeds.length > 0 ? { seed_statements: seeds } : {}),
      });
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="host-deliberation-form" onSubmit={handleSubmit}>
      <h3 className="host-deliberation-title">Host a conversation</h3>

      <label className="delib-form-field">
        <span className="delib-form-label">Topic</span>
        <input
          type="text"
          className="delib-form-input"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="What should residents weigh in on?"
          required
        />
      </label>

      <label className="delib-form-field">
        <span className="delib-form-label">Framing</span>
        <textarea
          className="delib-form-input delib-form-textarea"
          value={framing}
          onChange={(e) => setFraming(e.target.value)}
          placeholder="Provide context for participants..."
          rows={4}
          required
        />
      </label>

      <div className="delib-form-row">
        <label className="delib-form-field">
          <span className="delib-form-label">Deadline (optional)</span>
          <input
            type="datetime-local"
            className="delib-form-input"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </label>

        <label className="delib-form-field">
          <span className="delib-form-label">Participant goal (optional)</span>
          <input
            type="number"
            className="delib-form-input"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="e.g. 50"
            min="1"
          />
        </label>
      </div>

      <label className="delib-form-field">
        <span className="delib-form-label">Seed statements (one per line, optional)</span>
        <textarea
          className="delib-form-input delib-form-textarea"
          value={seedStatements}
          onChange={(e) => setSeedStatements(e.target.value)}
          placeholder="Statements to start the conversation..."
          rows={3}
        />
      </label>

      {error && <p className="delib-form-error">{error}</p>}

      <div className="delib-form-actions">
        <button type="button" className="delib-form-cancel-btn" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="submit"
          className="delib-form-submit-btn"
          disabled={!topic.trim() || !framing.trim() || submitting}
        >
          {submitting ? "Creating..." : "Create Deliberation"}
        </button>
      </div>
    </form>
  );
}
