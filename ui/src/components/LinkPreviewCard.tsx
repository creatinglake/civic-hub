import { useEffect, useState } from "react";
import { getLinkPreview, type LinkPreviewData } from "../services/api";
import "./LinkPreviewCard.css";

/**
 * Slice 9 — rich preview card for an external URL.
 *
 * Lifecycle:
 *   - mount → fetch /api/link-preview?url=…
 *   - while loading → render a simple placeholder shell
 *   - success → render thumbnail (if available) + title + site + description
 *   - error / no title → fall back to a plain <a> so the URL stays clickable
 *
 * The endpoint always returns HTTP 200; failures are reported via the
 * `error` field. Rendering decisions branch on title presence, not on
 * HTTP status.
 */

interface Props {
  url: string;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; preview: LinkPreviewData }
  | { kind: "error"; message: string };

export default function LinkPreviewCard({ url }: Props) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    getLinkPreview(url)
      .then((preview) => {
        if (cancelled) return;
        setState({ kind: "ready", preview });
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setState({ kind: "error", message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (state.kind === "loading") {
    return (
      <div className="link-preview-card link-preview-card-loading" aria-busy="true">
        <span className="link-preview-card-skeleton-image" />
        <div className="link-preview-card-skeleton-body">
          <span className="link-preview-card-skeleton-line" />
          <span className="link-preview-card-skeleton-line link-preview-card-skeleton-line-short" />
        </div>
      </div>
    );
  }

  // No-rich-preview fallback. Render the URL as a plain link so the
  // affordance survives even when OG metadata is missing or scraping
  // failed. We still show the URL text — never a bare card.
  if (
    state.kind === "error" ||
    !state.preview.title ||
    state.preview.error
  ) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="link-preview-card link-preview-card-fallback"
      >
        {url}
      </a>
    );
  }

  const { preview } = state;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="link-preview-card"
    >
      {preview.image_url && (
        <span className="link-preview-card-image">
          <img src={preview.image_url} alt="" loading="lazy" decoding="async" />
        </span>
      )}
      <span className="link-preview-card-body">
        {preview.site_name && (
          <span className="link-preview-card-site">{preview.site_name}</span>
        )}
        <span className="link-preview-card-title">{preview.title}</span>
        {preview.description && (
          <span className="link-preview-card-description">
            {preview.description}
          </span>
        )}
      </span>
    </a>
  );
}
