// civic.brief module — lifecycle transitions
//
// A brief's lifecycle is narrower than a vote's because briefs don't have
// a participation window. Once created, a brief sits in `active` status
// with publication_status="pending" while it awaits admin review.
// Approval walks it through closed → finalized as publication completes.
//
// Process-level status transitions (draft | active | closed | finalized):
//
//   (implicit draft) → active      at creation
//   active → closed                on admin approval (brief review done)
//   closed → finalized             after email + result_published emit
//
// Publication sub-state (pending | approved | published) mirrors the
// admin workflow more finely than process status alone can.

import type { BriefProcessState, BriefPublicationStatus } from "./models.js";

export function canEdit(state: BriefProcessState): boolean {
  return state.publication_status === "pending";
}

export function canApprove(state: BriefProcessState): boolean {
  return state.publication_status === "pending";
}

export function isPublished(state: BriefProcessState): boolean {
  return state.publication_status === "published";
}

/**
 * Validate an intended publication_status transition. Throws on invalid
 * transitions so callers don't have to re-encode the rules.
 */
export function assertPublicationTransition(
  from: BriefPublicationStatus,
  to: BriefPublicationStatus,
): void {
  const allowed: Record<BriefPublicationStatus, BriefPublicationStatus[]> = {
    pending: ["approved"],
    approved: ["published"],
    published: [],
  };
  if (!allowed[from].includes(to)) {
    throw new Error(
      `Invalid brief publication transition: ${from} → ${to}`,
    );
  }
}
