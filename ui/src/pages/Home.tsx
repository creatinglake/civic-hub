import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listProcesses, type ProcessSummary, type VoteSummary, type ProposalSummary } from "../services/api";
import HubHeader from "../components/HubHeader";
import ProcessCard from "../components/ProcessCard";
import ProposalCard from "../components/ProposalCard";

export default function Home() {
  const [processes, setProcesses] = useState<ProcessSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listProcesses()
      .then(setProcesses)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Separate by type
  const votes = processes
    .filter((p): p is VoteSummary => p.type === "civic.vote")
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const proposals = processes
    .filter((p): p is ProposalSummary => p.type === "civic.proposal")
    .sort((a, b) => b.support_count - a.support_count);

  return (
    <div className="page">
      <HubHeader />

      {loading && <p className="section">Loading...</p>}
      {error && <p className="section error">Failed to load: {error}</p>}

      {!loading && !error && (
        <>
          {/* Active Votes */}
          <section className="section">
            <h2 className="section-title">Active Votes</h2>
            {votes.length === 0 ? (
              <p className="empty-state-inline">No votes yet.</p>
            ) : (
              <ul className="process-list">
                {votes.map((v) => (
                  <li key={v.id}>
                    <Link to={`/process/${v.id}`} className="process-link">
                      <ProcessCard process={v} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Proposed Votes */}
          <section className="section">
            <h2 className="section-title">Proposed Votes</h2>
            <p className="section-description">
              Ideas that need community endorsement before becoming official votes.
            </p>
            {proposals.length === 0 ? (
              <p className="empty-state-inline">No proposals yet.</p>
            ) : (
              <ul className="process-list">
                {proposals.map((p) => (
                  <li key={p.id}>
                    <Link to={`/process/${p.id}`} className="process-link">
                      <ProposalCard proposal={p} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
