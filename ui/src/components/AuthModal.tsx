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
  const [residencyChecked, setResidencyChecked] = useState(false);
  // Slice 11 — gate sign-up on acceptance of the bundled legal docs.
  // Pre-checked for users who have already accepted the current version
  // (returning sign-ins on a different device, etc.) so we don't make
  // them re-accept here when they'll just hit the modal anyway. For
  // brand-new sign-ups it starts unchecked and submit is disabled.
  const [legalAccepted, setLegalAccepted] = useState(
    !!user && user.tos_version_accepted === CURRENT_LEGAL_VERSION,
  );
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
    if (!legalAccepted) {
      setError("Please agree to the Terms, Privacy Policy, and Code of Conduct to continue.");
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
      // Slice 11 — record the legal-document acceptance the user
      // confirmed on the email step. We do this before login() so the
      // refreshed user object the context picks up already carries the
      // current version, which suppresses the re-acceptance modal.
      // If the call fails (network blip, e.g.), surface it but still
      // let the session proceed — the modal will catch the user on
      // the next page load.
      let userToLogin = result.user;
      try {
        const accepted = await acceptTos(result.token, CURRENT_LEGAL_VERSION);
        userToLogin = accepted.user;
      } catch (acceptErr) {
        console.warn(
          "[auth] accept-tos failed during sign-up; re-acceptance modal will retry.",
          acceptErr,
        );
      }
      login(result.token, userToLogin, result.role, result.author_label);

      if (userToLogin.is_resident) {
        // Already a resident (returning user) — done
        onComplete();
      } else {
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

    if (!residencyChecked) {
      setError("Please confirm your residency to continue");
      return;
    }

    if (!token) {
      setError("Session expired. Please start over.");
      return;
    }

    setLoading(true);
    try {
      const result = await affirmResidency(token);
      updateUser(result.user);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to confirm residency");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="intro-overlay" onClick={onDismiss}>
      <div
        className="intro-modal auth-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Create an account to participate"
        onClick={(e) => e.stopPropagation()}
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

            <label className="auth-checkbox-label auth-legal-checkbox">
              <input
                type="checkbox"
                checked={legalAccepted}
                onChange={(e) => setLegalAccepted(e.target.checked)}
                disabled={loading}
              />
              <span>
                I've read and agree to the{" "}
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
              disabled={loading || !email.trim() || !legalAccepted}
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

        {/* Step 3: Residency affirmation */}
        {step === "residency" && (
          <form onSubmit={handleResidency}>
            <h2 className="auth-title">Confirm residency</h2>
            <p className="auth-description">
              To participate in Floyd County civic processes, please confirm
              your residency.
            </p>

            <label className="auth-checkbox-label">
              <input
                type="checkbox"
                checked={residencyChecked}
                onChange={(e) => setResidencyChecked(e.target.checked)}
                disabled={loading}
              />
              <span>
                I confirm that I am a resident of Floyd County, Virginia
              </span>
            </label>

            {error && <p className="form-error">{error}</p>}

            <button
              type="submit"
              className="auth-continue-button"
              disabled={loading || !residencyChecked}
            >
              {loading ? "Confirming..." : "Continue"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
