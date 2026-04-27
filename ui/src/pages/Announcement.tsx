import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getAnnouncement, type Announcement } from "../services/api";
import { useAuth } from "../context/AuthContext";
import { relativeTime, absoluteTime } from "../components/FeedPost";
import PostFeaturedImage from "../components/PostFeaturedImage";
import LinkPreviewCard from "../components/LinkPreviewCard";
import "./Announcement.css";

const URL_RE = /\bhttps?:\/\/\S+/gi;

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

  // Legacy Slice-4 announcements may have author_role === "board" —
  // normalize for display. Everything else renders verbatim.
  const roleLabel =
    announcement.author_role === "board" ? "Board member" : announcement.author_role;
  const isAdminLabel = roleLabel === "Admin";
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
          {isAdminLabel ? "Announcement" : `${roleLabel} announcement`}
        </p>
        <h1>{announcement.title}</h1>
        <p className="announcement-meta">
          Posted by {roleLabel}{" "}
          <time
            dateTime={announcement.created_at}
            title={absoluteTime(announcement.created_at)}
          >
            {relativeTime(announcement.created_at)}
          </time>
          {wasEdited && announcement.last_edited_at && (
            <>
              {" · Last edited "}
              <time
                dateTime={announcement.last_edited_at}
                title={absoluteTime(announcement.last_edited_at)}
              >
                {relativeTime(announcement.last_edited_at)}
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

      {announcement.image_url && (
        <PostFeaturedImage
          src={announcement.image_url}
          alt={announcement.image_alt ?? ""}
        />
      )}

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

      {(() => {
        // Render preview cards for any unique URL found in the body.
        // Slice 9 contract: previews fall back to plain links inside
        // <LinkPreviewCard> when the upstream OG fetch fails. We dedupe
        // here so a body that mentions the same URL twice produces one
        // card.
        const urls = Array.from(
          new Set(
            (announcement.body.match(URL_RE) ?? [])
              .map((u) => u.replace(/[)\].,;!?]+$/, ""))
              .filter((u) => u.length > 0),
          ),
        );
        if (urls.length === 0) return null;
        return (
          <section className="announcement-link-previews" aria-label="Linked previews">
            {urls.map((u) => (
              <LinkPreviewCard key={u} url={u} />
            ))}
          </section>
        );
      })()}

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

