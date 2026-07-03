// Creator — the single, consistent way to render a content creator/author
// across the site. Renders the resolved display name (never a raw user id)
// with an optional prefix ("by", "Proposed by", "Created by", "Posted by")
// and an "Admin" pill when the creator is a hub admin.
//
// Always feed this the RESOLVED name from the API (creator_name /
// author_name), which the backend guarantees is full_name ?? display_name
// ?? "Resident" — never a raw id or email.

import "./Creator.css";

interface CreatorProps {
  /** Resolved display name (already falls back to "Resident" server-side). */
  name: string;
  /** Show the "Admin" pill when true. */
  isAdmin?: boolean;
  /** Optional lead-in, e.g. "by", "Proposed by", "Created by", "Posted by". */
  prefix?: string;
}

export default function Creator({ name, isAdmin, prefix }: CreatorProps) {
  const display = name && name.trim().length > 0 ? name : "Resident";
  return (
    <span className="creator">
      {prefix ? `${prefix} ` : null}
      <span className="creator-name">{display}</span>
      {isAdmin && <span className="creator-admin-badge">Admin</span>}
    </span>
  );
}
