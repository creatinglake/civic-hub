import { useState, useRef, useEffect } from "react";
import "./ShareButton.css";

export interface ShareButtonProps {
  title: string;
  url?: string;
  shareText?: string;
  label?: string;
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
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const fullUrl = url ?? (typeof window !== "undefined" ? window.location.href : "");
  const text = shareText ?? title;

  useEffect(() => {
    if (!menuOpen) return;
    function close(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menuOpen]);

  async function handleShare() {
    setError(null);

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.share === "function"
    ) {
      try {
        await navigator.share({ title, text, url: fullUrl });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
      }
    }

    setMenuOpen((prev) => !prev);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(fullUrl);
      setCopied(true);
      setMenuOpen(false);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setError("Couldn't copy the link. Try selecting the URL in the address bar.");
      window.setTimeout(() => setError(null), 4000);
    }
  }

  function handleFacebook() {
    const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(fullUrl)}`;
    window.open(fbUrl, "_blank", "noopener,noreferrer,width=600,height=400");
    setMenuOpen(false);
  }

  const buttonClass =
    variant === "ghost" ? "share-button share-button-ghost" : "share-button";

  return (
    <div className="share-button-wrapper" ref={wrapperRef}>
      <button
        type="button"
        className={buttonClass}
        onClick={handleShare}
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

      {menuOpen && (
        <div className="share-menu">
          <button type="button" className="share-menu-item" onClick={handleCopy}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            Copy link
          </button>
          <button type="button" className="share-menu-item" onClick={handleFacebook}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            Share on Facebook
          </button>
        </div>
      )}

      {error && (
        <p className="share-button-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
