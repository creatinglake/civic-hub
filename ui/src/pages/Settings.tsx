// User settings page — minimum viable for Slice 5.
//
// Today: single panel for the daily digest toggle. Future preferences
// (theme, jurisdiction, email templates, etc.) should land here as
// additional panels. Authenticated users only — residents and
// admins alike see the same page.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { setDigestSubscription } from "../services/api";
import {
  deleteAccount as deleteAccountApi,
  getMe,
  getStoredToken,
} from "../services/auth";
import "./Settings.css";

export default function Settings() {
  const { user, logout, loading } = useAuth();
  const navigate = useNavigate();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Slice 13.11 — account deletion local state. The user types
  // their own email into the confirm input; submit is gated on an
  // exact match so accidental clicks can't go through.
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Pull the current subscription state from the server on mount.
  // /auth/me returns the full User, which includes digest_subscribed
  // after Slice 5. We refetch instead of trusting the cached context so
  // the toggle reflects any out-of-band changes (e.g. the user clicked
  // an unsubscribe link in another tab).
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    const token = getStoredToken();
    if (!token) return;
    getMe(token)
      .then(({ user: u }) => {
        setSubscribed(u.digest_subscribed);
      })
      .catch((err: Error) => {
        setError(`Could not load settings: ${err.message}`);
      });
  }, [loading, user]);

  async function handleDeleteAccount() {
    if (!user) return;
    const token = getStoredToken();
    if (!token) {
      setDeleteError("Session expired. Sign in again before deleting.");
      return;
    }
    if (deleteConfirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
      setDeleteError("Email doesn't match your account.");
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteAccountApi(token);
      // Clear local session state and redirect home. The auth
      // context's logout() drops the token from localStorage and
      // resets user/role; navigating to "/" lands them on the
      // public feed.
      logout();
      navigate("/", { replace: true });
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete account",
      );
      setDeleting(false);
    }
  }

  async function onToggle(next: boolean) {
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const res = await setDigestSubscription(next);
      setSubscribed(res.digest_subscribed);
      setMessage(
        res.digest_subscribed
          ? "Subscribed. You'll receive a daily digest whenever there's new civic activity."
          : "Unsubscribed. You won't receive the daily digest.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save setting");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="page settings-page">
        <p className="settings-status">Loading…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="page settings-page">
        <h1>Settings</h1>
        <p className="settings-status">
          You need to be signed in to manage your settings.{" "}
          <Link to="/">Return to the feed</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="page settings-page">
      <div className="settings-body">
        <h1>Settings</h1>
        <p className="settings-subtitle">
          Manage how you hear from {"Floyd Civic Hub"}.
        </p>

        {error && <p className="form-error">{error}</p>}

        <section className="settings-panel">
          <h3>Daily email digest</h3>
          <p className="form-hint">
            Once a day, we send a summary of new votes, published results,
            civic briefs, and announcements. If there's nothing new, we
            don't send anything. You can unsubscribe any time from the
            link in every email or with the toggle below.
          </p>

          <label className="settings-toggle">
            <input
              type="checkbox"
              checked={subscribed ?? false}
              onChange={(e) => onToggle(e.target.checked)}
              disabled={subscribed === null || saving}
            />
            <span className="settings-toggle-label">
              {subscribed === null
                ? "Loading…"
                : subscribed
                  ? "Subscribed — daily digest on"
                  : "Unsubscribed — daily digest off"}
            </span>
          </label>

          {message && <p className="settings-message">{message}</p>}
        </section>

        <p className="settings-signed-in">
          Signed in as <strong>{user.email}</strong>.
        </p>

        {/* Slice 13.11 — danger zone: self-service account deletion.
            Frees the email for re-use, removes the user record,
            cascades sessions. Public-record references (comments,
            endorsements, vote participation) become orphaned (no
            attribution) — vote tallies are unaffected because
            vote_records have no user_id by design. */}
        <section className="settings-panel settings-danger-zone">
          <h3>Delete account</h3>
          <p className="form-hint">
            Permanently delete your account. Your votes stay counted but
            will no longer be linked to your identity. Comments and
            endorsements you posted will remain in the public record but
            without your name attached. This cannot be undone.
          </p>

          {!deleteOpen && (
            <button
              type="button"
              className="settings-danger-button"
              onClick={() => {
                setDeleteOpen(true);
                setDeleteConfirmEmail("");
                setDeleteError(null);
              }}
            >
              Delete my account
            </button>
          )}

          {deleteOpen && (
            <div className="settings-danger-confirm">
              <p>
                Type your email <strong>{user.email}</strong> below to confirm.
              </p>
              <input
                type="email"
                className="form-input"
                value={deleteConfirmEmail}
                onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                placeholder={user.email}
                disabled={deleting}
                autoFocus
              />
              {deleteError && <p className="form-error">{deleteError}</p>}
              <div className="settings-danger-actions">
                <button
                  type="button"
                  className="settings-danger-button"
                  onClick={handleDeleteAccount}
                  disabled={
                    deleting ||
                    deleteConfirmEmail.trim().toLowerCase() !==
                      user.email.toLowerCase()
                  }
                >
                  {deleting ? "Deleting…" : "Permanently delete"}
                </button>
                <button
                  type="button"
                  className="settings-danger-cancel"
                  onClick={() => {
                    setDeleteOpen(false);
                    setDeleteConfirmEmail("");
                    setDeleteError(null);
                  }}
                  disabled={deleting}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
