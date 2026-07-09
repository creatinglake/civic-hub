import { useNavigate } from "react-router-dom";
import hub from "../config/hub";
import { exitPreview } from "../hooks/usePreviewMode";
import "./PreviewBanner.css";

/**
 * Persistent bar shown while a logged-out visitor is browsing the hub in
 * read-only preview during the private beta. Communicates that participation
 * is gated and routes back to the BetaLanding splash (where the waitlist form
 * lives) via exitPreview() + navigate home.
 */
export default function PreviewBanner() {
  const navigate = useNavigate();

  function goToWaitlist() {
    exitPreview();
    navigate("/");
  }

  return (
    <div className="preview-banner" role="region" aria-label="Preview notice">
      <span className="preview-banner-text">
        You're viewing {hub.name} in read-only preview.{" "}
        <span className="preview-banner-sub">
          Participation is invite-only during our private beta.
        </span>
      </span>
      <button
        type="button"
        className="preview-banner-cta"
        onClick={goToWaitlist}
      >
        Join the waitlist
      </button>
    </div>
  );
}
