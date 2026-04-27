// Slice 11 — render a markdown-backed legal page (Privacy Policy,
// Terms of Service, or Code of Conduct).
//
// The markdown content is bundled at build time via Vite's `?raw`
// import (no network fetch, no runtime CMS), so the documents ship
// inside the JS bundle. Internal cross-links between the three
// documents (e.g. /code-of-conduct from /terms) route through React
// Router instead of triggering a full page load — a CustomLink mapped
// onto react-markdown's anchor renderer handles that.
//
// Operator note: the markdown files keep `{OPERATOR_NAME}`,
// `{CONTACT_EMAIL}`, `{OPERATOR_MAILING_ADDRESS}` placeholders.
// Substitution is the operator's job before public launch — see
// HANDOFF.md for the checklist. We render placeholders verbatim so
// they're impossible to miss in QA.

import { useEffect } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import "./LegalPage.css";

interface Props {
  /** The full markdown document, imported via `?raw`. */
  markdown: string;
  /** Document title — used as the browser tab title. */
  title: string;
}

/**
 * Custom anchor renderer. URLs that start with "/" are treated as
 * internal routes and rendered with React Router's <Link> so a click
 * doesn't trigger a full reload. Mailto links keep the default mail
 * handler. Everything else opens in a new tab with rel safety attrs.
 */
function CustomLink({
  href,
  children,
}: {
  href?: string;
  children?: React.ReactNode;
}) {
  if (!href) return <a>{children}</a>;
  if (href.startsWith("/")) {
    return <Link to={href}>{children}</Link>;
  }
  if (href.startsWith("mailto:")) {
    return <a href={href}>{children}</a>;
  }
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

export default function LegalPage({ markdown, title }: Props) {
  // Set the document title so the legal page is identifiable in the
  // browser tab. We don't reset on unmount — React Router's next page
  // will overwrite it if it cares.
  useEffect(() => {
    document.title = `${title} · Floyd Civic Hub`;
  }, [title]);

  return (
    <article className="page legal-page">
      <Link to="/" className="back-link">
        &larr; Home
      </Link>
      <div className="legal-prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{ a: CustomLink }}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </article>
  );
}
