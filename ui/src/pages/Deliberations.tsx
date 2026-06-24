import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { DeliberationSummary } from "../services/api";
import {
  listDeliberations,
  startDeliberation,
} from "../services/api";
import HubInfo from "../components/HubInfo";
import ProcessPicker from "../components/ProcessPicker";
import "./Deliberations.css";

export default function Deliberations() {
  const { user, isAdmin } = useAuth();
  const [processes, setProcesses] = useState<DeliberationSummary[]>([]);
  const [showPicker, setShowPicker] = useState(false);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const procs = await listDeliberations();
      setProcesses(procs);
    } catch {
      // no deliberations yet
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const active = processes.filter((p) => p.lifecycle === "active");
  const completed = processes.filter(
    (p) => p.lifecycle === "closed" || p.lifecycle === "finalized",
  );
  const draft = processes.filter((p) => p.lifecycle === "draft");

  async function handleStart(processId: string, topic: string) {
    const confirmed = window.confirm(
      `Start the deliberation "${topic}"?\n\nThis will create a live Polis conversation that participants can join immediately.`,
    );
    if (!confirmed) return;

    setStartingId(processId);
    try {
      await startDeliberation(processId);
      await load();
    } catch (err: any) {
      alert(
        `Failed to start deliberation: ${err.message ?? "Unknown error"}`,
      );
    } finally {
      setStartingId(null);
    }
  }

  return (
    <div className="page page-home">
      <HubInfo />
      {showPicker && <ProcessPicker onDismiss={() => setShowPicker(false)} context="conversation" />}

      <section className="section">
        <div className="section-header-row">
          <div>
            <h2 className="section-title">Community Conversations</h2>
            <p className="section-description">
              Vote on statements and see where the community stands.
            </p>
          </div>
          {user && (
            <button type="button" className="home-start-btn" onClick={() => setShowPicker(true)}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              Start a conversation
            </button>
          )}
        </div>
      </section>

      {loading && <p className="section deliberations-loading">Loading...</p>}

      {!loading && draft.length > 0 && isAdmin && (
        <section className="section">
          <h2 className="section-title">Draft</h2>
          {draft.map((p) => (
            <div key={p.process_id} className="deliberation-draft-card">
              <div className="draft-card-content">
                <span className="draft-topic">{p.topic}</span>
                <span className="draft-badge">Draft</span>
              </div>
              <button
                className="start-deliberation-btn"
                disabled={startingId === p.process_id}
                onClick={() => handleStart(p.process_id, p.topic)}
              >
                {startingId === p.process_id
                  ? "Starting..."
                  : "Start Conversation"}
              </button>
            </div>
          ))}
        </section>
      )}

      {!loading && active.length > 0 && (
        <section className="section">
          <h2 className="section-title">Active Conversations</h2>
          <ul className="process-list">
            {active.map((p) => (
              <li key={p.process_id}>
                <Link to={`/deliberation/${p.process_id}`} className="process-link">
                  <div className="deliberation-card">
                    <div className="deliberation-card-header">
                      <h3>{p.topic}</h3>
                      <span className="status-badge status-active">active</span>
                    </div>
                    {(p.participant_count ?? 0) > 0 && (
                      <p className="deliberation-card-participants">
                        {p.participant_count} participant{p.participant_count !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && completed.length > 0 && (
        <section className="section">
          <h2 className="section-title">Completed</h2>
          <ul className="process-list">
            {completed.map((p) => (
              <li key={p.process_id}>
                <Link to={`/deliberation/${p.process_id}`} className="process-link">
                  <div className="deliberation-card">
                    <div className="deliberation-card-header">
                      <h3>{p.topic}</h3>
                      <span className="status-badge status-archived">completed</span>
                    </div>
                    {(p.participant_count ?? 0) > 0 && (
                      <p className="deliberation-card-participants">
                        {p.participant_count} participant{p.participant_count !== 1 ? "s" : ""}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && processes.length === 0 && (
        <p className="section deliberations-empty">
          No conversations yet.
          {isAdmin ? " Create one to gather community perspectives." : ""}
        </p>
      )}
    </div>
  );
}
