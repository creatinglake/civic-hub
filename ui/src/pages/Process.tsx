import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { getProcessState, type ProcessState } from "../services/api";
import VotePanel from "../components/VotePanel";

// Simulated current user — will be replaced with real identity later
const CURRENT_USER = "user:demo";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function Process() {
  const { id } = useParams<{ id: string }>();
  const [process, setProcess] = useState<ProcessState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(() => {
    if (!id) return;
    getProcessState(id, CURRENT_USER)
      .then(setProcess)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="error">Error: {error}</p>;
  if (!process) return <p>Vote not found.</p>;

  return (
    <div className="page detail-page">
      <Link to="/" className="back-link">&larr; All votes</Link>

      <div className="process-header">
        <h1>{process.title}</h1>
        <span className={`status-badge status-${process.status}`}>
          {process.status}
        </span>
      </div>

      <p className="process-description">{process.description}</p>

      <div className="process-meta">
        <span>Created by {process.created_by}</span>
        <span>Created {formatDate(process.created_at)}</span>
        {process.status === "open" && process.closes_at && (
          <span>Vote closes on {formatDate(process.closes_at)}</span>
        )}
        {process.status === "closed" && <span>Voting closed</span>}
      </div>

      <VotePanel process={process} actor={CURRENT_USER} onVoted={fetchState} />
    </div>
  );
}
