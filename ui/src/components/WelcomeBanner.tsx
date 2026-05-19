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
    <div className="welcome-banner">
      <span className="welcome-banner-text">
        New to the Floyd Civic Hub?{" "}
        <Link to="/welcome" className="welcome-banner-link">
          Read a short introduction &rarr;
        </Link>
      </span>
      <button
        type="button"
        className="welcome-banner-dismiss"
        aria-label="Dismiss welcome banner"
        onClick={handleDismiss}
      >
        &times;
      </button>
    </div>
  );
}
