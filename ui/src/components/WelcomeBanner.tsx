import { useState } from "react";
import { Link } from "react-router-dom";
import "./WelcomeBanner.css";

const STORAGE_KEY = "welcome-banner-dismissed-v1";

function isDismissed(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function dismiss(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // localStorage unavailable — banner may reappear, acceptable
  }
}

export default function WelcomeBanner() {
  const [visible, setVisible] = useState(() => !isDismissed());

  if (!visible) return null;

  function handleDismiss() {
    dismiss();
    setVisible(false);
  }

  return (
    <section className="welcome-banner">
      <div className="welcome-banner-inner">
        <div className="welcome-banner-content">
          <h2 className="welcome-banner-title">
            New to the Floyd Civic Hub?
          </h2>
          <p className="welcome-banner-body">
            Learn what this site is, how it works, and how you can
            participate in Floyd County civic life.
          </p>
          <Link to="/welcome" className="welcome-banner-button">
            Learn more
          </Link>
        </div>
        <button
          type="button"
          className="welcome-banner-dismiss"
          onClick={handleDismiss}
        >
          Dismiss &times;
        </button>
      </div>
    </section>
  );
}
