import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import {
  requestCode,
  verifyCode,
  affirmResidency,
  acceptTos,
} from "../services/auth";
import { CURRENT_LEGAL_VERSION } from "../config/legal";

type Step = "email" | "code" | "residency";

interface Props {
  /** Called when the full auth flow is complete (verified + resident) */
  onComplete: () => void;
  /** Called when the user dismisses the modal */
  onDismiss: () => void;
}

export default function AuthModal({ onComplete, onDismiss }: Props) {
  const { user, token, login, updateUser } = useAuth();
  const [step, setStep] = useState<Step>(() => {
    if (user && user.email_verified && !user.is_resident) return "residency";
    if (user && user.email_verified && user.is_resident) return "residency"; // will auto-complete
    return "email";
  });
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  // Slice 13.9 — single combined gate checkbox for new users: residency
  // affirmation + legal-doc acceptance in one click. Returning residents
  // (is_resident=true) skip this step entirely. The app-root
  // ReAcceptModal still catches returning users whose tos_version is
  // stale, so this single gate is sufficient at sign-up.
  const [gateChecked, setGateChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  // If user is already fully authenticated + resident, just complete
  useEffect(() => {
    if (user && user.email_verified && user.is_resident) {
      onComplete();
    }
  }, [user, onComplete]);

  // Focus management
  useEffect(() => {
    closeRef.current?.focus();
  }, []);

  // Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onDismiss]);

  async function handleRequestCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email.trim() || !email.includes("@")) {
      setError("Please enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      await requestCode(email.trim());
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!code.trim()) {
      setError("Please enter the verification code");
      return;
    }

    setLoading(true);
    try {
      const result = await verifyCode(email.trim(), code.trim());
      login(result.token, result.user, result.role, result.author_label);

      if (result.user.is_resident) {
        // Returning resident — already accepted residency at first
        // sign-up. The app-root ReAcceptModal catches them if their
        // legal-version is stale, so no extra gate here.
        onComplete();
      } else {
        // New user — combined residency + legal acceptance step.
        setStep("residency");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleResidency(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!gateChecked) {
      setError(
        "Please confirm your residency and acceptance of the policies to continue.",
      );
      return;
    }

    if (!token) {
      setError("Session expired. Please start over.");
      return;
    }

    setLoading(true);
    try {
      // Combined gate: affirm residency + record legal-doc acceptance.
      // Both calls happen here so a network blip on either surfaces an
      // error the user can retry on this same step rather than getting
      // half-completed sign-ups. acceptTos failure is non-fatal — the
      // re-acceptance modal will catch them on next page load.
      const residencyResult = await affirmResidency(token);
      let nextUser = residencyResult.user;
      try {
        const accepted = await acceptTos(token, CURRENT_LEGAL_VERSION);
        nextUser = accepted.user;
      } catch (acceptErr) {
        console.warn(
          "[auth] accept-tos failed during sign-up; re-acceptance modal will retry.",
          acceptErr,
        );
      }
      updateUser(nextUser);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm residency");
    } finally {
      setLoading(false);
    }
  }

  return (
    // Slice 13.9: clicking the overlay does NOT dismiss the modal.
    // Users must use the X close button (or Escape) so accidental
    // outside-clicks don't lose form state mid-sign-up. The modal
    // itself doesn't need stopPropagation now that the overlay has
    // no click handler.
    <div className="intro-overlay">
      <div
        className="intro-modal auth-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Create an account to participate"
      >
        <button
          ref={closeRef}
          className="intro-close"
          onClick={onDismiss}
          aria-label="Close"
        >
          &times;
        </button>

        {/* Step 1: Email */}
        {step === "email" && (
          <form onSubmit={handleRequestCode}>
            <h2 className="auth-title">Create an account to participate</h2>
            <p className="auth-description">
              Enter your email to get started. We'll send you a verification code.
            </p>

            <div className="form-field">
              <label htmlFor="auth-email" className="form-label">Email</label>
              <input
                id="auth-email"
                type="email"
                className="form-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoFocus
                disabled={loading}
              />
            </div>

            {error && <p className="form-error">{error}</p>}

            <button
              type="submit"
              className="auth-continue-button"
              disabled={loading || !email.trim()}
            >
              {loading ? "Sending..." : "Continue"}
            </button>
          </form>
        )}

        {/* Step 2: Verify code */}
        {step === "code" && (
          <form onSubmit={handleVerifyCode}>
            <h2 className="auth-title">Check your email</h2>
            <p className="auth-description">
              We sent a 6-digit code to <strong>{email}</strong>
            </p>
            <p className="auth-hint">
              Use code: 000000
            </p>

            <div className="form-field">
              <label htmlFor="auth-code" className="form-label">Verification code</label>
              <input
                id="auth-code"
                type="text"
                className="form-input auth-code-input"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                maxLength={6}
                autoFocus
                disabled={loading}
              />
            </div>

            {error && <p className="form-error">{error}</p>}

            <button
              type="submit"
              className="auth-continue-button"
              disabled={loading || !code.trim()}
            >
              {loading ? "Verifying..." : "Verify"}
            </button>

            <button
              type="button"
              className="auth-back-link"
              onClick={() => { setStep("email"); setCode(""); setError(null); }}
              disabled={loading}
            >
              Use a different email
            </button>
          </form>
        )}

        {/* Step 3: Combined residency + legal acceptance gate
            (Slice 13.9 — new users only; returning residents skip
            this step automatically per handleVerifyCode). */}
        {step === "residency" && (
          <form onSubmit={handleResidency}>
            <h2 className="auth-title">One last thing</h2>
            <p className="auth-description">
              To participate in Floyd County civic processes, please confirm
              your residency and review the policies below.
            </p>

            <label className="auth-checkbox-label auth-legal-checkbox">
              <input
                type="checkbox"
                checked={gateChecked}
                onChange={(e) => setGateChecked(e.target.checked)}
                disabled={loading}
              />
              <span>
                I confirm that I am a resident of Floyd County, Virginia, and
                I have read and agree to the{" "}
                <a href="/terms" target="_blank" rel="noopener noreferrer">
                  Terms of Service
                </a>
                ,{" "}
                <a href="/privacy" target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </a>
                , and{" "}
                <a
                  href="/code-of-conduct"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Code of Conduct
                </a>
                .
              </span>
            </label>

            {error && <p className="form-error">{error}</p>}

            <button
              type="submit"
              className="auth-continue-button"
              disabled={loading || !gateChecked}
            >
              {loading ? "Confirming..." : "Continue"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
