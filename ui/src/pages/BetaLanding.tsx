import { useState } from "react";
import { useNavigate } from "react-router-dom";
import hub from "../config/hub";
import AuthModal from "../components/AuthModal";
import WaitlistForm from "../components/WaitlistForm";
import { enterPreview } from "../hooks/usePreviewMode";
import "./BetaLanding.css";

export default function BetaLanding() {
  const [showAuth, setShowAuth] = useState(false);
  const navigate = useNavigate();

  function browseSite() {
    enterPreview();
    navigate("/");
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
            sign in to get started — or take a look around first.
          </p>
          <div className="beta-landing-actions">
            <button
              type="button"
              className="beta-landing-signin"
              onClick={() => setShowAuth(true)}
            >
              Sign in
            </button>
            <button
              type="button"
              className="beta-landing-browse"
              onClick={browseSite}
            >
              Browse the site &rarr;
            </button>
          </div>
          <p className="beta-landing-feedback-note">
            Have a look around and tell us what you think — use the{" "}
            <strong>Feedback</strong> button at the top of any page.
          </p>
        </div>

        <WaitlistForm
          heading="Join the waitlist"
          description="Interested in participating? Leave your email and we'll let you know when the hub opens up."
        />
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
