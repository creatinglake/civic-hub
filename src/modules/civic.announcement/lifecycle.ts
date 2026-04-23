// civic.announcement module — lifecycle helpers
//
// Announcements are instant-publish: no draft, scheduled, active, or
// closed state. The standard process.status is "finalized" from the
// moment of creation and stays there through edits.
//
// Authorization to edit:
//   - The original author can always edit their own announcement.
//   - A user with admin role can edit any announcement (e.g. to correct
//     a factual error or enforce policy).
//   - A Board member cannot edit another Board member's announcement.

import type { AnnouncementProcessState, AnnouncementAuthorRole } from "./models.js";

export function canEdit(
  state: AnnouncementProcessState,
  editorId: string,
  editorRole: AnnouncementAuthorRole,
): boolean {
  if (editorRole === "admin") return true;
  return state.author_id === editorId;
}
