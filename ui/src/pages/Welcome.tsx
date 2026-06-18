import { useEffect } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import hub from "../config/hub";
import welcomeMd from "../content/welcome/welcome.md?raw";
import "../components/LegalPage.css";
import "./Welcome.css";

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

export default function Welcome() {
  useEffect(() => {
    document.title = `Welcome · ${hub.name}`;
  }, []);

  return (
    <article className="page legal-page welcome-page">
      <Link to="/" className="back-link">
        &larr; Home
      </Link>

      <div className="welcome-utility-top">
        <a
          href="/floyd-civic-hub-introduction.pdf"
          target="_blank"
          rel="noopener noreferrer"
          className="welcome-pdf-link"
        >
          Download as PDF (4 pages)
        </a>
      </div>

      <div className="legal-prose">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          components={{ a: CustomLink }}
        >
          {welcomeMd}
        </ReactMarkdown>
      </div>

      <div className="welcome-utility-bottom">
        <p>
          Have feedback?{" "}
          <Link to="/feedback">Send it through the Hub</Link> or email{" "}
          <a href="mailto:contact@civic.social">contact@civic.social</a>.
        </p>
      </div>
    </article>
  );
}
