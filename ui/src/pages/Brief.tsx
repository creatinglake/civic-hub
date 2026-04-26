import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getPublicBrief, type PublicBrief } from "../services/api";
import { relativeTime, absoluteTime } from "../components/FeedPost";
import "./Brief.css";

export default function BriefPage() {
  const { id } = useParams<{ id: string }>();
  const [brief, setBrief] = useState<PublicBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    getPublicBrief(id)
      .then((b) => {
        if (cancelled) return;
        setBrief(b);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="page brief-page">
        <p className="brief-status">Loading brief…</p>
      </div>
    );
  }

  if (error || !brief) {
    return (
      <div className="page brief-page">
        <Link to="/" className="back-link">
          &larr; Home
        </Link>
        <p className="brief-status brief-status-error">
          {error ?? "Brief not found."}
        </p>
      </div>
    );
  }

  return (
    <article className="page brief-page">
      <Link to="/" className="back-link">
        &larr; Home
      </Link>
      <header className="brief-header">
        <p className="brief-eyebrow">Civic Brief</p>
        <h1>{brief.title}</h1>
        <p className="brief-meta">
          Published{" "}
          <time
            dateTime={brief.published_at}
            title={absoluteTime(brief.published_at)}
          >
            {relativeTime(brief.published_at)}
          </time>{" "}
          · {brief.participation_count} resident
          {brief.participation_count === 1 ? "" : "s"} participated ·{" "}
          <Link to={`/process/${brief.source_process_id}`} className="inline-link">
            view vote
          </Link>
        </p>
      </header>

      <section className="brief-section">
        <h2>Positions</h2>
        <ul className="brief-bars">
          {brief.position_breakdown.map((p) => (
            <li key={p.option_id} className="brief-bar-row">
              <div className="brief-bar-label">
                <span>{p.option_label}</span>
                <span className="brief-bar-count">
                  {p.count} ({p.percentage}%)
                </span>
              </div>
              <div className="brief-bar-track">
                <div
                  className="brief-bar-fill"
                  style={{ width: `${Math.min(p.percentage, 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      {brief.comments.length > 0 && (
        <section className="brief-section">
          <h2>Community comments</h2>
          <ul className="brief-comments-list">
            {brief.comments.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </section>
      )}

      {brief.admin_notes.trim().length > 0 && (
        <section className="brief-section">
          <h2>Notes from the Civic Hub</h2>
          <p className="brief-admin-notes">{brief.admin_notes}</p>
        </section>
      )}
    </article>
  );
}

