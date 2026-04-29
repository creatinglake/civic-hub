// ShareButton — single-purpose "share this" affordance.
//
// On click:
//   1. If navigator.share is available (mobile + modern desktop),
//      open the OS share sheet.
//   2. Otherwise fall back to writing the URL to the clipboard and
//      flashing "Link copied" inline for ~2.5s.
//
// User-cancelled native shares (AbortError) are silent — no fallback,
// no error. Other share-API failures fall through to the clipboard
// path so an iOS quirk doesn't strand the user without a working
// share.
//
// Why no platform buttons? Civic content gets shared into Facebook
// groups, iMessage threads, WhatsApp DMs, neighborhood listservs —
// not posted to public Twitter / Facebook walls. The native share
// sheet covers all of those; per-platform buttons cover one each
// and clutter the UI.

import { useState } from "react";
import "./ShareButton.css";

export interface ShareButtonProps {
  /** Short title — used as the share-sheet title and accessible label. */
  title: string;
  /** Absolute URL to share. Defaults to the current page URL. */
  url?: string;
  /**
   * Body text passed to the share sheet. Some apps (Twitter, SMS)
   * pre-fill it; others (iMessage) attach it as a separate line.
   * Defaults to the title verbatim, on the assumption the recipient
   * already understands the surrounding context from the URL unfurl.
   */
  shareText?: string;
  /** Visible button label. Defaults to "Share". */
  label?: string;
  /** Visual variant. "default" (filled) or "ghost" (outlined). */
  variant?: "default" | "ghost";
}

export default function ShareButton({
  title,
  url,
  shareText,
  label = "Share",
  variant = "default",
}: ShareButtonProps) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const fullUrl = url ?? (typeof window !== "undefined" ? window.location.href : "");
    const text = shareText ?? title;
    setError(null);

    // 1. Native share sheet, when available.
    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share({ title, text, url: fullUrl });
        return;
      } catch (err) {
        // User dismissed the sheet — treat as a no-op, not an error.
        if (err instanceof DOMException && err.name === "AbortError") return;
        // Anything else (Permission, NotAllowed, generic) falls through
        // to the clipboard path so the user still gets a working share.
      }
    }

    // 2. Clipboard fallback.
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Couldn't copy the link. Try selecting the URL in the address bar.");
      window.setTimeout(() => setError(null), 4000);
    }
  }

  const buttonClass =
    variant === "ghost" ? "share-button share-button-ghost" : "share-button";

  return (
    <div className="share-button-wrapper">
      <button
        type="button"
        className={buttonClass}
        onClick={handleClick}
        aria-label={`Share: ${title}`}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        <span>{copied ? "Link copied" : label}</span>
      </button>
      {error && (
        <p className="share-button-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
