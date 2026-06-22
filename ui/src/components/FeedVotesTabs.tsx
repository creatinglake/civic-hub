// Slice 12.1 — primary in-page tabs for the two big surfaces a
// resident comes here for: the chronological civic Feed, or the
// action-oriented Votes page.
//
// Implemented as React Router NavLinks so each tab is also a real
// route (/, /votes) — bookmarkable, back-button-safe, and the active
// state comes from the URL rather than a parallel piece of UI state.
//
// The tabs sit BELOW the banner / hub info, so they swap "what the
// page does" without competing with the site identity. Context-
// specific surfaces (filter pills on Feed, suggest-a-vote CTA on
// Votes) live below the tab strip on each page so they only appear
// when relevant.

import { useRef, useEffect } from "react";
import { NavLink, useLocation } from "react-router-dom";
import "./FeedVotesTabs.css";

const SCROLLABLE_TABS: ReadonlyArray<{ to: string; label: string }> = [
  { to: "/deliberations", label: "Conversations" },
  { to: "/propose", label: "Proposals" },
  { to: "/votes", label: "Votes" },
  { to: "/projects", label: "Projects" },
];

export default function FeedVotesTabs() {
  const navRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();

  useEffect(() => {
    if (pathname === "/") return;
    const el = navRef.current;
    if (!el) return;
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";

    const navH = parseInt(getComputedStyle(document.documentElement).getPropertyValue("--nav-h")) || 61;

    const tryScroll = () => {
      const top = el.getBoundingClientRect().top + window.scrollY - navH;
      if (top > 0 && document.documentElement.scrollHeight > window.innerHeight) {
        window.scrollTo({ top, behavior: "instant" });
        return true;
      }
      return false;
    };

    const timers = [0, 100, 300, 600].map((ms) =>
      setTimeout(() => tryScroll(), ms),
    );
    return () => timers.forEach(clearTimeout);
  }, [pathname]);

  return (
    <nav className="feed-votes-tabs" ref={navRef} aria-label="Primary content">
      <div className="feed-votes-tabs-pinned">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `feed-votes-tab${isActive ? " is-active" : ""}`
          }
        >
          Feed
        </NavLink>
        <span className="feed-votes-tab-divider-line" aria-hidden="true" />
      </div>
      <ul className="feed-votes-tabs-list">
        {SCROLLABLE_TABS.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              className={({ isActive }) =>
                `feed-votes-tab${isActive ? " is-active" : ""}`
              }
            >
              {t.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
