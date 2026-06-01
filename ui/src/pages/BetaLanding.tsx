import { useState } from "react";
import hub from "../config/hub";
import { joinWaitlist } from "../services/waitlist";
import AuthModal from "../components/AuthModal";
import "./BetaLanding.css";

export default function BetaLanding() {
  const [showAuth, setShowAuth] = useState(false);

  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleWaitlist(e: React.FormEvent) {
    e.preventDefault();
    if (honeypot) return;

    setSubmitting(true);
    setError(null);
    try {
      await joinWaitlist(email, notes);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="beta-landing">
      <div className="beta-landing-hero">
        <img src={hub.banner_url} alt={hub.banner_alt} />
      </div>

      <div className="beta-landing-body">
        <h1>{hub.name}</h1>
        <p className="beta-landing-tagline">
          {hub.tagline}
        </p>

        <div className="beta-landing-cta">
          <p>
            This hub is currently in private beta. If you've been invited,
            sign in to get started.
          </p>
          <button
            type="button"
            className="beta-landing-signin"
            onClick={() => setShowAuth(true)}
          >
            Sign in
          </button>
        </div>

        <section className="beta-waitlist">
          <h2>Join the waitlist</h2>
          <p>
            Interested in participating? Leave your email and we'll let you
            know when the hub opens up.
          </p>

          {success ? (
            <div className="beta-waitlist-success">
              You're on the list! We'll email you when access opens up.
            </div>
          ) : (
            <form className="beta-waitlist-form" onSubmit={handleWaitlist}>
              <input
                className="form-input"
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={submitting}
              />
              <textarea
                className="form-textarea"
                placeholder="Anything you'd like us to know? (optional)"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={submitting}
                maxLength={500}
              />
              <div className="beta-hp" aria-hidden="true">
                <label>
                  Website
                  <input
                    type="text"
                    name="website"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="beta-waitlist-submit"
                disabled={submitting || !email}
              >
                {submitting ? "Joining..." : "Join waitlist"}
              </button>
              {error && <p className="beta-waitlist-error">{error}</p>}
            </form>
          )}
        </section>
      </div>

      {showAuth && (
        <AuthModal
          onComplete={() => setShowAuth(false)}
          onDismiss={() => setShowAuth(false)}
        />
      )}
    </div>
  );
}
