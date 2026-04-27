import { useEffect, useRef, useState } from "react";
import "./PostFeaturedImage.css";

/**
 * Slice 9 — public-facing featured image used on Announcement and
 * VoteResults pages. Lazy-loaded; tap/click opens a lightbox via the
 * native <dialog> element.
 *
 * Aspect-ratio container is set to 16:9 so the image slot has a fixed
 * height before the bytes arrive, avoiding cumulative layout shift.
 * `object-fit: cover` keeps the framing predictable.
 */

interface Props {
  src: string;
  alt: string;
}

export default function PostFeaturedImage({ src, alt }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [open, setOpen] = useState(false);

  // The native <dialog> open/close API is imperative. We mirror it into
  // React state so close-on-backdrop-click works without breaking the
  // semantic open() / close() lifecycle.
  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  function onBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    // Native <dialog> click target is the backdrop iff target === dialog.
    if (e.target === e.currentTarget) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className="post-featured-image-button"
        onClick={() => setOpen(true)}
        aria-label="Open image in larger view"
      >
        <span className="post-featured-image-frame">
          <img src={src} alt={alt} loading="lazy" decoding="async" />
        </span>
      </button>

      <dialog
        ref={dialogRef}
        className="post-featured-image-dialog"
        onClick={onBackdropClick}
        onClose={() => setOpen(false)}
      >
        <button
          type="button"
          className="post-featured-image-dialog-close"
          onClick={() => setOpen(false)}
          aria-label="Close"
        >
          ×
        </button>
        <img src={src} alt={alt} className="post-featured-image-dialog-img" />
      </dialog>
    </>
  );
}
