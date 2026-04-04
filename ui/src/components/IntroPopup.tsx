import { useEffect, useRef } from "react";

const STORAGE_KEY = "seen_intro_popup";

interface Props {
  onDismiss: () => void;
}

export function hasSeenIntro(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export function markIntroSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // localStorage unavailable — popup may reappear, acceptable degradation
  }
}

export default function IntroPopup({ onDismiss }: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // Focus trap: focus the close button on mount
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Dismiss on Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        handleDismiss();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  function handleDismiss() {
    markIntroSeen();
    onDismiss();
  }

  // Click on overlay backdrop dismisses
  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === overlayRef.current) {
      handleDismiss();
    }
  }

  return (
    <div
      className="intro-overlay"
      ref={overlayRef}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to the Floyd County Civic Hub"
    >
      <div className="intro-modal">
        <button
          className="intro-close"
          onClick={handleDismiss}
          ref={closeRef}
          aria-label="Close"
        >
          &times;
        </button>

        <h2 className="intro-title">Welcome to the Floyd County Civic Hub</h2>

        <div className="intro-body">
          <p>
            This is a simple, nonpartisan tool to understand what people in
            Floyd County think about local issues.
          </p>
          <ul>
            <li>Vote on clearly framed questions</li>
            <li>One vote per verified account</li>
            <li>Results are advisory and shared with local officials</li>
          </ul>
          <p>
            The goal is to provide a clearer signal of community sentiment
            between elections.
          </p>
        </div>

        <p className="intro-closing">
          This is an early pilot. Feedback is welcome.
        </p>

        <button className="intro-continue" onClick={handleDismiss}>
          Continue
        </button>
      </div>
    </div>
  );
}
