import { NavLink } from "react-router-dom";
import "./AdminTabs.css";

/**
 * Shared tab navigation for admin pages. Sits at the top of every admin
 * surface (Proposals, Briefs, future: users/settings/etc) so the admin
 * can jump between surfaces without leaving the admin context.
 *
 * Each tab is a NavLink so React Router assigns `aria-current="page"`
 * automatically on the active tab.
 */
export default function AdminTabs() {
  return (
    <nav className="admin-tabs" aria-label="Admin sections">
      <NavLink to="/admin/proposals" className={tabClass}>
        Proposals
      </NavLink>
      <NavLink to="/admin/vote-results" className={tabClass}>
        Vote results
      </NavLink>
      {/* Slice 11 — Moderation sits between Vote results and Meeting
          summaries (per the slice-11 IA spec). Read-only log page. */}
      <NavLink to="/admin/moderation" className={tabClass}>
        Moderation
      </NavLink>
      <NavLink to="/admin/meeting-summaries" className={tabClass}>
        Meeting summaries
      </NavLink>
      <NavLink to="/admin/settings" className={tabClass}>
        Settings
      </NavLink>
    </nav>
  );
}

function tabClass({ isActive }: { isActive: boolean }): string {
  return `admin-tab${isActive ? " is-active" : ""}`;
}
