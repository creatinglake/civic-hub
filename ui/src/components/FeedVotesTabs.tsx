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

import { NavLink } from "react-router-dom";
import "./FeedVotesTabs.css";

const TABS: ReadonlyArray<{ to: string; label: string; end?: boolean }> = [
  { to: "/", label: "Feed", end: true },
  { to: "/votes", label: "Votes" },
];

export default function FeedVotesTabs() {
  return (
    <nav className="feed-votes-tabs" aria-label="Primary content">
      <ul className="feed-votes-tabs-list">
        {TABS.map((t) => (
          <li key={t.to}>
            <NavLink
              to={t.to}
              end={t.end}
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
