// Admin settings page — hub-wide configuration.
//
// Holds all admin-editable settings that aren't tied to a single
// proposal or brief review flow. Today: brief recipient emails and the
// announcement authors list. Future additions (theme, jurisdiction,
// email templates, etc.) should land here too.

import { useEffect, useState } from "react";
import {
  adminGetSettings,
  adminPatchSettings,
  type AnnouncementAuthor,
} from "../services/api";
import AdminTabs from "../components/AdminTabs";
import "./AdminSettings.css";

export default function AdminSettings() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Brief recipients ---
  const [recipientsText, setRecipientsText] = useState("");
  const [savingRecipients, setSavingRecipients] = useState(false);
  const [recipientsMessage, setRecipientsMessage] = useState<string | null>(null);

  // --- Announcement authors ---
  const [authors, setAuthors] = useState<AnnouncementAuthor[]>([]);
  const [savingAuthors, setSavingAuthors] = useState(false);
  const [authorsMessage, setAuthorsMessage] = useState<string | null>(null);

  useEffect(() => {
    adminGetSettings()
      .then((s) => {
        setRecipientsText(s.brief_recipient_emails.join(", "));
        setAuthors(s.announcement_authors);
        setLoaded(true);
      })
      .catch((err: Error) => {
        setError(`Could not load settings: ${err.message}`);
      });
  }, []);

  async function saveRecipients() {
    setSavingRecipients(true);
    setRecipientsMessage(null);
    try {
      const input = recipientsText
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      const saved = await adminPatchSettings({ brief_recipient_emails: input });
      setRecipientsText(saved.brief_recipient_emails.join(", "));
      setRecipientsMessage(
        saved.brief_recipient_emails.length === 0
          ? "Cleared — brief approvals will be blocked until a recipient is set."
          : `Saved. Briefs will be delivered to ${saved.brief_recipient_emails.length} recipient(s).`,
      );
    } catch (err) {
      setRecipientsMessage(
        err instanceof Error ? err.message : "Failed to save recipients",
      );
    } finally {
      setSavingRecipients(false);
    }
  }

  function updateAuthor(i: number, patch: Partial<AnnouncementAuthor>) {
    setAuthors((cur) => cur.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }

  function addAuthor() {
    setAuthors((cur) => [...cur, { email: "", label: "Board member" }]);
  }

  function removeAuthor(i: number) {
    setAuthors((cur) => cur.filter((_, idx) => idx !== i));
  }

  async function saveAuthors() {
    setSavingAuthors(true);
    setAuthorsMessage(null);
    try {
      const cleaned: AnnouncementAuthor[] = [];
      for (const a of authors) {
        const email = a.email.trim();
        const label = a.label.trim();
        if (!email && !label) continue;
        if (!email || !label) {
          throw new Error("Each author needs both an email and a label.");
        }
        cleaned.push({ email, label });
      }
      const saved = await adminPatchSettings({ announcement_authors: cleaned });
      setAuthors(saved.announcement_authors);
      setAuthorsMessage(
        saved.announcement_authors.length === 0
          ? "Cleared — only admins can post announcements."
          : `Saved. ${saved.announcement_authors.length} non-admin author(s) can now post.`,
      );
    } catch (err) {
      setAuthorsMessage(
        err instanceof Error ? err.message : "Failed to save authors",
      );
    } finally {
      setSavingAuthors(false);
    }
  }

  return (
    <div className="page admin-settings-page">
      <AdminTabs />
      <div className="admin-settings-body">
        <h1>Settings</h1>
        <p className="admin-subtitle">
          Hub-wide configuration. Changes take effect immediately — no redeploy required.
        </p>

        {error && <p className="form-error">{error}</p>}

        {/* --- Brief delivery --- */}
        <section className="admin-settings-panel">
          <h3>Brief delivery</h3>
          <label className="form-label" htmlFor="brief-recipients">
            Brief recipient emails
          </label>
          <p className="form-hint">
            Comma- or newline-separated list of addresses that receive the brief
            on approval. Changes take effect on the next approval.
          </p>
          <textarea
            id="brief-recipients"
            className="form-textarea"
            rows={2}
            value={recipientsText}
            onChange={(e) => setRecipientsText(e.target.value)}
            disabled={!loaded || savingRecipients}
            placeholder="board@floyd.gov, clerk@floyd.gov"
          />
          <div className="admin-settings-actions">
            <button
              type="button"
              className="admin-convert-button"
              onClick={saveRecipients}
              disabled={!loaded || savingRecipients}
            >
              {savingRecipients ? "Saving…" : "Save recipients"}
            </button>
            {recipientsMessage && (
              <span className="admin-settings-message">{recipientsMessage}</span>
            )}
          </div>
        </section>

        {/* --- Announcement authors --- */}
        <section className="admin-settings-panel">
          <h3>Announcement authors</h3>
          <p className="form-hint">
            Non-admin users who can post announcements. The label shows on
            the public feed and announcement page — e.g. "Board member",
            "Planning Committee", "Guest speaker". Admins can always post
            (as "Admin") and don't need to be listed here.
          </p>

          {authors.length === 0 && (
            <p className="empty-state-inline" style={{ margin: "var(--space-sm) 0" }}>
              No non-admin authors configured. Only admins can post announcements.
            </p>
          )}

          {authors.map((author, i) => (
            <div key={i} className="announcement-author-row">
              <input
                className="form-input"
                type="email"
                value={author.email}
                onChange={(e) => updateAuthor(i, { email: e.target.value })}
                placeholder="author@example.com"
                disabled={!loaded || savingAuthors}
              />
              <input
                className="form-input"
                type="text"
                value={author.label}
                onChange={(e) => updateAuthor(i, { label: e.target.value })}
                placeholder="Board member"
                disabled={!loaded || savingAuthors}
                maxLength={50}
              />
              <button
                type="button"
                className="admin-remove-section"
                onClick={() => removeAuthor(i)}
                disabled={savingAuthors}
                aria-label={`Remove author ${i + 1}`}
              >
                ×
              </button>
            </div>
          ))}

          <button
            type="button"
            className="admin-add-section"
            onClick={addAuthor}
            disabled={!loaded || savingAuthors}
          >
            + Add author
          </button>

          <div className="admin-settings-actions" style={{ marginTop: "var(--space-md)" }}>
            <button
              type="button"
              className="admin-convert-button"
              onClick={saveAuthors}
              disabled={!loaded || savingAuthors}
            >
              {savingAuthors ? "Saving…" : "Save authors"}
            </button>
            {authorsMessage && (
              <span className="admin-settings-message">{authorsMessage}</span>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
