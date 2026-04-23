// User settings page — minimum viable for Slice 5.
//
// Today: single panel for the daily digest toggle. Future preferences
// (theme, jurisdiction, email templates, etc.) should land here as
// additional panels. Authenticated users only — residents and
// admins alike see the same page.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { setDigestSubscription } from "../services/api";
import { getMe, getStoredToken } from "../services/auth";
import "./Settings.css";

export default function Settings() {
  const { user, loading } = useAuth();
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      </div>
    </div>
  );
}
