import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  listProcesses,
  listCivicProposals,
  type ProcessSummary,
  type PublishedVoteResultsSummary,
  type VoteSummary,
  type ProposalSummary,
  type CivicProposalSummary,
} from "../services/api";
import HubInfo from "../components/HubInfo";
import ProcessCard from "../components/ProcessCard";
import ProposalCard from "../components/ProposalCard";
import FeedVotesTabs from "../components/FeedVotesTabs";

/**
 * Slice 12 — Votes-page filter pills mirror the home-feed pattern.
 *   all       — show every section
 *   active    — vote processes accepting input right now
 *   proposed  — community-submitted ideas gathering support
 *   finalized — closed / finalized votes (results page link if available)
 *
 * State is mirrored in the URL via `?status=` so a filtered view is
 * bookmarkable and survives refresh.
 */
type VotesFilterKey = "all" | "active" | "proposed" | "finalized";

const FILTER_CHOICES: ReadonlyArray<{ key: VotesFilterKey; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "proposed", label: "Proposed" },
  { key: "finalized", label: "Finalized" },
];

function isFilterKey(v: string | null): v is VotesFilterKey {
  return v === "active" || v === "proposed" || v === "finalized";
}

export default function Votes() {
  const [processes, setProcesses] = useState<ProcessSummary[]>([]);
  const [civicProposals, setCivicProposals] = useState<CivicProposalSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [params, setParams] = useSearchParams();
  const rawStatus = params.get("status");
  const activeFilter: VotesFilterKey = isFilterKey(rawStatus) ? rawStatus : "all";

  function setActiveFilter(next: VotesFilterKey) {
    const updated = new URLSearchParams(params);
    if (next === "all") updated.delete("status");
    else updated.set("status", next);
    setParams(updated, { replace: true });
  }

  useEffect(() => {
    Promise.all([listProcesses(), listCivicProposals()])
      .then(([procs, props]) => {
        setProcesses(procs);
        setCivicProposals(props);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const activeVotes = processes
    .filter((p): p is VoteSummary =>
      p.type === "civic.vote" && p.status === "active"
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const completedVotes = processes
    .filter((p): p is VoteSummary =>
      p.type === "civic.vote" &&
      (p.status === "closed" || p.status === "finalized")
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // Index published vote-results by source vote id so completed-vote
  // cards can link to their results page in one lookup. Accepts the
  // legacy "civic.brief" type literal for unmigrated rows.
  const voteResultsByVote = useMemo(() => {
    const map = new Map<string, PublishedVoteResultsSummary>();
    for (const p of processes) {
      const t = (p as { type?: string }).type;
      if (t === "civic.vote_results" || t === "civic.brief") {
        map.set(
          (p as PublishedVoteResultsSummary).source_process_id,
          p as PublishedVoteResultsSummary,
        );
      }
    }
    return map;
  }, [processes]);

  const proposedVotes = processes
    .filter((p): p is VoteSummary =>
      p.type === "civic.vote" &&
      (p.status === "proposed" || p.status === "threshold_met" || p.status === "draft")
    )
    .sort((a, b) => b.support_count - a.support_count);

  const legacyProposals = processes
    .filter((p): p is ProposalSummary => p.type === "civic.proposal")
    .sort((a, b) => b.support_count - a.support_count);

  const activeCivicProposals = civicProposals
    .filter((p) => p.status === "submitted" || p.status === "endorsed")
    .sort((a, b) => b.support_count - a.support_count);

  const hasAnyProposals =
    proposedVotes.length > 0 ||
    legacyProposals.length > 0 ||
    activeCivicProposals.length > 0;

  // Section visibility — derived from the active filter.
  const showActive = activeFilter === "all" || activeFilter === "active";
  const showProposed = activeFilter === "all" || activeFilter === "proposed";
  const showFinalized = activeFilter === "all" || activeFilter === "finalized";

  return (
    <div className="page page-home">
      <HubInfo />

      {/* Slice 12.1 — Feed | Votes tab strip. Sits below HubInfo so
          site identity reads first, then the user picks what surface
          they want. Same component on the Home page; the active
          state comes from the URL via NavLink. */}
      <FeedVotesTabs />

      {/* Slice 12 — pinned suggest-a-vote CTA at the top of the Votes
          page. Higher visual weight than the inline "Be the first..."
          link it replaces, because suggesting a vote is the primary
          creative action on this page. The body copy doubles as a
          gentle explainer about how proposals turn into votes. */}
      <section className="suggest-vote-cta">
        <div className="suggest-vote-cta-inner">
          <h2 className="suggest-vote-cta-title">Got an idea? Suggest a vote.</h2>
          <p className="suggest-vote-cta-body">
            Submit something for the community to consider. With enough
            citizen support, your suggestion becomes an official Floyd
            County advisory vote.
          </p>
          <Link to="/propose" className="suggest-vote-cta-button">
            + Suggest a vote
          </Link>
        </div>
      </section>

      {/* Slice 12 — pill filter row. Mirrors the home-feed pattern;
          state lives in `?status=`. */}
      <nav className="votes-filter" aria-label="Filter votes by status">
        <ul className="votes-filter-list">
          {FILTER_CHOICES.map((c) => {
            const isActive = c.key === activeFilter;
            return (
              <li key={c.key}>
                <button
                  type="button"
                  className={`votes-filter-pill${isActive ? " is-active" : ""}`}
                  onClick={() => setActiveFilter(c.key)}
                  aria-pressed={isActive}
                >
                  {c.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {loading && <p className="section">Loading...</p>}
      {error && <p className="section error">Failed to load: {error}</p>}

      {!loading && !error && (
        <>
          {showActive && (
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
          )}

          {showProposed && (
            <section className="section">
              <div className="section-header-row">
                <h2 className="section-title">Proposed Votes</h2>
                <Link to="/propose" className="propose-link">+ Suggest a vote</Link>
              </div>
              <p className="section-description">
                Ideas submitted by community members. Endorse the ones
                you care about to help them become official votes.
              </p>
              {!hasAnyProposals ? (
                <p className="empty-state-inline">
                  No proposals yet.{" "}
                  <Link to="/propose" className="inline-link">Be the first to suggest a vote.</Link>
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
          )}

          {showFinalized && (
            <section className="section">
              <h2 className="section-title">Completed Votes</h2>
              {completedVotes.length === 0 ? (
                <p className="empty-state-inline">No completed votes yet.</p>
              ) : (
                <ul className="process-list">
                  {completedVotes.map((v) => {
                    const results = voteResultsByVote.get(v.id);
                    return (
                      <li key={v.id}>
                        <div className="completed-vote-card">
                          <Link to={`/process/${v.id}`} className="process-link">
                            <ProcessCard process={v} />
                          </Link>
                          <div className="completed-vote-brief-row">
                            {results ? (
                              <Link to={`/vote-results/${results.id}`} className="brief-link">
                                View vote results &rarr;
                              </Link>
                            ) : (
                              <span className="brief-pending-chip">
                                Vote results pending review
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
          )}
        </>
      )}
    </div>
  );
}
