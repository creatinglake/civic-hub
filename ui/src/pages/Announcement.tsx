import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAnnouncement, type Announcement } from "../services/api";
import { useAuth } from "../context/AuthContext";
import "./Announcement.css";

export default function AnnouncementPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();

  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    getAnnouncement(id)
      .then((a) => {
        if (cancelled) return;
        setAnnouncement(a);
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
      <div className="page announcement-page">
        <p className="announcement-status">Loading announcement…</p>
      </div>
    );
  }

  if (error || !announcement) {
    return (
      <div className="page announcement-page">
        <Link to="/" className="back-link">
          &larr; Home
        </Link>
        <p className="announcement-status announcement-status-error">
          {error ?? "Announcement not found."}
        </p>
      </div>
    );
  }

  const roleLabel =
    announcement.author_role === "board" ? "Board member" : "Admin";
  const canEdit =
    isAdmin || (!!user?.id && user.id === announcement.author_id);
  const wasEdited = announcement.edit_count > 0;

  return (
    <article className="page announcement-page">
      <Link to="/" className="back-link">
        &larr; Home
      </Link>
      <header className="announcement-header">
        <p className="announcement-eyebrow">
          {announcement.author_role === "board"
            ? "Board announcement"
            : "Announcement"}
        </p>
        <h1>{announcement.title}</h1>
        <p className="announcement-meta">
          Posted by {roleLabel} on{" "}
          <time dateTime={announcement.created_at}>
            {formatDate(announcement.created_at)}
          </time>
          {wasEdited && announcement.last_edited_at && (
            <>
              {" · Last edited "}
              <time dateTime={announcement.last_edited_at}>
                {formatDate(announcement.last_edited_at)}
              </time>
            </>
          )}
          {canEdit && (
            <>
              {" · "}
              <Link
                to={`/announcement/${announcement.id}/edit`}
                className="announcement-edit-link"
              >
                Edit
              </Link>
            </>
          )}
        </p>
      </header>

      <div className="announcement-body">
        {announcement.body.split(/\n\n+/).map((para, i) => (
          <p key={i} className="announcement-paragraph">
            {para.split(/\n/).map((line, j, arr) => (
              <span key={j}>
                {line}
                {j < arr.length - 1 && <br />}
              </span>
            ))}
          </p>
        ))}
      </div>

      {announcement.links.length > 0 && (
        <section className="announcement-links">
          <h2>Links</h2>
          <ul>
            {announcement.links.map((link, i) => (
              <li key={i}>
                <a href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </article>
  );
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
