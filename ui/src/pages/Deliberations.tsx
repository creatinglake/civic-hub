import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../context/AuthContext";
import type { DeliberationSummary, DeliberationReadModel } from "../services/api";
import {
  listDeliberations,
  getDeliberation,
  startDeliberation,
} from "../services/api";
import HubInfo from "../components/HubInfo";
import DeliberationPanel from "../components/deliberation/DeliberationPanel";
import CompletedDeliberation from "../components/deliberation/CompletedDeliberation";
import HostDeliberationForm from "../components/deliberation/HostDeliberationForm";
import "./Deliberations.css";

export default function Deliberations() {
  const { isAdmin } = useAuth();
  const [processes, setProcesses] = useState<DeliberationSummary[]>([]);
  const [completedDetails, setCompletedDetails] = useState<
    Map<string, DeliberationReadModel>
  >(new Map());
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const procs = await listDeliberations();
      setProcesses(procs);

      const completed = procs.filter(
        (p) => p.lifecycle === "closed" || p.lifecycle === "finalized",
      );
      const details = new Map<string, DeliberationReadModel>();
      for (const p of completed) {
        try {
          const detail = await getDeliberation(p.process_id);
          details.set(p.process_id, detail);
        } catch {
          // skip
        }
      }
      setCompletedDetails(details);
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

  function handleCreated() {
    setShowForm(false);
    load();
  }

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

      <section className="section">
        <div className="section-header-row">
          <div>
            <h2 className="section-title">Community Conversations</h2>
            <p className="section-description">
              Vote on statements and see where the community stands.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              className="section-action-btn deliberations-action-btn"
              onClick={() => setShowForm(true)}
              disabled={showForm}
            >
              + Create a conversation
            </button>
          )}
        </div>
      </section>

      {showForm && (
        <div className="deliberations-form-wrapper">
          <HostDeliberationForm
            onCreated={handleCreated}
            onCancel={() => setShowForm(false)}
          />
        </div>
      )}

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
          {active.map((p) => (
            <DeliberationPanel
              key={p.process_id}
              processId={p.process_id}
            />
          ))}
        </section>
      )}

      {!loading && completed.length > 0 && (
        <section className="section">
          <h2 className="section-title">Completed</h2>
          {completed.map((p) => {
            const detail = completedDetails.get(p.process_id);
            return detail ? (
              <CompletedDeliberation key={p.process_id} process={detail} />
            ) : null;
          })}
        </section>
      )}

      {!loading && processes.length === 0 && !showForm && (
        <p className="section deliberations-empty">
          No conversations yet.
          {isAdmin ? " Create one to gather community perspectives." : ""}
        </p>
      )}
    </div>
  );
}
