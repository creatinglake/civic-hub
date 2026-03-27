import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { getProcessState, type ProcessState } from "../services/api";
import VotePanel from "../components/VotePanel";

export default function Process() {
  const { id } = useParams<{ id: string }>();
  const [process, setProcess] = useState<ProcessState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchState = useCallback(() => {
    if (!id) return;
    getProcessState(id)
      .then(setProcess)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p className="error">Error: {error}</p>;
  if (!process) return <p>Process not found.</p>;

  return (
    <div className="page">
      <Link to="/" className="back-link">&larr; All processes</Link>

      <div className="process-header">
        <h1>{process.title}</h1>
        <span className={`status-badge status-${process.status}`}>
          {process.status}
        </span>
      </div>

      <p className="process-description">{process.description}</p>

      <div className="process-meta">
        <span>Type: {process.type}</span>
        <span>Created: {new Date(process.created_at).toLocaleDateString()}</span>
        <span>By: {process.created_by}</span>
      </div>

      <VotePanel process={process} onVoted={fetchState} />
    </div>
  );
}
