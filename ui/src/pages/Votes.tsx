import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  listProcesses,
  listCivicProposals,
  type ProcessSummary,
  type PublishedBriefSummary,
  type VoteSummary,
  type ProposalSummary,
  type CivicProposalSummary,
} from "../services/api";
import HubInfo from "../components/HubInfo";
import ProcessCard from "../components/ProcessCard";
import ProposalCard from "../components/ProposalCard";

export default function Votes() {
  const [processes, setProcesses] = useState<ProcessSummary[]>([]);
  const [civicProposals, setCivicProposals] = useState<CivicProposalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      listProcesses(),
      listCivicProposals(),
    ])
      .then(([procs, props]) => {
        setProcesses(procs);
        setCivicProposals(props);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  // Active votes — accepting participation right now.
  const activeVotes = processes
    .filter((p): p is VoteSummary =>
      p.type === "civic.vote" && p.status === "active"
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Completed votes — closed or finalized. A brief may or may not be
  // published against them; the chip tells the story either way.
  const completedVotes = processes
    .filter((p): p is VoteSummary =>
      p.type === "civic.vote" &&
      (p.status === "closed" || p.status === "finalized")
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Index published briefs by source vote id so completed-vote cards can
  // link to their brief in one lookup.
  const briefsByVote = useMemo(() => {
    const map = new Map<string, PublishedBriefSummary>();
    for (const p of processes) {
      if (p.type === "civic.brief") {
        map.set(p.source_process_id, p);
      }
    }
    return map;
  }, [processes]);

  // Votes in proposal phase (proposed, threshold_met, draft)
  const proposedVotes = processes
    .filter((p): p is VoteSummary =>
      p.type === "civic.vote" &&
      (p.status === "proposed" || p.status === "threshold_met" || p.status === "draft")
    )
    .sort((a, b) => b.support_count - a.support_count);

  // Legacy proposals (civic.proposal type)
  const legacyProposals = processes
    .filter((p): p is ProposalSummary => p.type === "civic.proposal")
    .sort((a, b) => b.support_count - a.support_count);

  // Civic proposals — user-submitted ideas (submitted or endorsed)
  const activeCivicProposals = civicProposals
    .filter((p) => p.status === "submitted" || p.status === "endorsed")
    .sort((a, b) => b.support_count - a.support_count);

  const hasAnyProposals =
    proposedVotes.length > 0 ||
    legacyProposals.length > 0 ||
    activeCivicProposals.length > 0;

  return (
    <div className="page page-home">
      <HubInfo />

      {loading && <p className="section">Loading...</p>}
      {error && <p className="section error">Failed to load: {error}</p>}

      {!loading && !error && (
        <>
          {/* Active Votes */}
          <section className="section">
            <h2 className="section-title">Active Votes</h2>
            {activeVotes.length === 0 ? (
              <p className="empty-state-inline">
                {completedVotes.length === 0
                  ? "Nothing here yet. Come back soon — the first issues will launch shortly."
                  : "No active votes right now. When the Board asks for resident input, it'll show up here."}
              </p>
            ) : (
              <ul className="process-list">
                {activeVotes.map((v) => (
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
            <div className="section-header-row">
              <h2 className="section-title">Proposed Votes</h2>
              <Link to="/propose" className="propose-link">+ Propose an Issue</Link>
            </div>
            <p className="section-description">
              Ideas submitted by community members. Endorse proposals you care about to make them official votes.
            </p>
            {!hasAnyProposals ? (
              <p className="empty-state-inline">
                No proposals yet.{" "}
                <Link to="/propose" className="inline-link">Be the first to propose an issue.</Link>
              </p>
            ) : (
              <ul className="process-list">
                {proposedVotes.map((v) => (
                  <li key={v.id}>
                    <Link to={`/process/${v.id}`} className="process-link">
                      <ProcessCard process={v} />
                    </Link>
                  </li>
                ))}

                {legacyProposals.map((p) => (
                  <li key={p.id}>
                    <Link to={`/process/${p.id}`} className="process-link">
                      <ProposalCard proposal={p} />
                    </Link>
                  </li>
                ))}

                {activeCivicProposals.map((p) => (
                  <li key={p.id}>
                    <Link to={`/proposal/${p.id}`} className="process-link">
                      <div className="proposal-card">
                        <div className="proposal-card-header">
                          <h3>{p.title}</h3>
                          <span className={`status-badge ${p.status === "endorsed" ? "admin-status-endorsed" : "status-gathering"}`}>
                            {p.status === "endorsed" ? "endorsed" : "gathering support"}
                          </span>
                        </div>
                        <div className="proposal-progress">
                          <div className="proposal-progress-track">
                            <div
                              className="proposal-progress-fill"
                              style={{
                                width: `${Math.min((p.support_count / p.support_threshold) * 100, 100)}%`,
                              }}
                            />
                          </div>
                          <span className="proposal-progress-label">
                            {p.support_count} / {p.support_threshold}
                          </span>
                        </div>
                        <div className="process-card-meta">
                          <span>by {p.submitted_by}</span>
                          <span>{new Date(p.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Completed Votes */}
          <section className="section">
            <h2 className="section-title">Completed Votes</h2>
            {completedVotes.length === 0 ? (
              <p className="empty-state-inline">No completed votes yet.</p>
            ) : (
              <ul className="process-list">
                {completedVotes.map((v) => {
                  const brief = briefsByVote.get(v.id);
                  return (
                    <li key={v.id}>
                      <div className="completed-vote-card">
                        <Link to={`/process/${v.id}`} className="process-link">
                          <ProcessCard process={v} />
                        </Link>
                        <div className="completed-vote-brief-row">
                          {brief ? (
                            <Link to={`/brief/${brief.id}`} className="brief-link">
                              View Civic Brief &rarr;
                            </Link>
                          ) : (
                            <span className="brief-pending-chip">
                              Civic Brief pending review
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
