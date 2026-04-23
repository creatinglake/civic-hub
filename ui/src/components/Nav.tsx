import { NavLink } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import "./Nav.css";

export default function Nav() {
  const { user, logout, isAdmin, canPostAnnouncements } = useAuth();

  return (
    <nav className="civic-nav" aria-label="Primary">
      <ul className="civic-nav-links">
        <li>
          <NavLink to="/" end className={navLinkClass}>
            Feed
          </NavLink>
        </li>
        <li>
          <NavLink to="/votes" className={navLinkClass}>
            Votes
          </NavLink>
        </li>
        <li>
          <NavLink to="/about" className={navLinkClass}>
            About
          </NavLink>
        </li>
      </ul>
      <div className="civic-nav-right">
        {canPostAnnouncements && (
          <NavLink
            to="/announcement/new"
            className={({ isActive }) =>
              `civic-nav-link civic-nav-link-post${isActive ? " is-active" : ""}`
            }
          >
            Post Announcement
          </NavLink>
        )}
        {isAdmin && (
          <NavLink
            to="/admin/proposals"
            className={({ isActive }) =>
              `civic-nav-link civic-nav-link-admin${isActive ? " is-active" : ""}`
            }
          >
            Admin
          </NavLink>
        )}
        {user && (
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `civic-nav-link civic-nav-link-settings${isActive ? " is-active" : ""}`
            }
          >
            Settings
          </NavLink>
        )}
        {user && (
          <div className="civic-nav-user">
            <span className="civic-nav-user-email">{user.email}</span>
            <button className="civic-nav-logout" onClick={logout}>
              Log out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

function navLinkClass({ isActive }: { isActive: boolean }): string {
  return `civic-nav-link${isActive ? " is-active" : ""}`;
}
