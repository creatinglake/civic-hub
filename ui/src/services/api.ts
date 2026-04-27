/**
 * API service — thin fetch wrapper for the Civic Hub backend.
 * All display data comes from read-layer endpoints.
 * Actions go through the internal process action endpoint.
 */

const API_BASE = import.meta.env.DEV ? "http://localhost:3000" : "/api";

/**
 * Token storage — shared with services/auth.ts. Must stay in sync with the
 * TOKEN_KEY defined there. The backend now enforces Bearer tokens on all
 * action endpoints (POST /process/:id/action, /proposals, /proposals/:id/support,
 * /process/:id/input, /admin/*). Without this header, those endpoints return
 * 401 and the UI shows "Authentication required".
 */
const TOKEN_KEY = "civic_auth_token";

function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // localStorage can throw in some privacy modes — fail safe.
    return null;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const token = getStoredToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Request failed: ${res.status}`);
  }

  return res.json();
}

// --- Structured content types ---

export interface ContentSection {
  title: string;
  body: string | string[];
}

export interface ContentLink {
  label: string;
  url: string;
}

export interface CommunityInputConfig {
  prompt: string;
  label: string;
}

export interface AfterVoteInfo {
  body: string;
  recipients: string[];
}

export interface ProcessContent {
  core_question?: string;
  sections?: ContentSection[];
  key_tradeoff?: string;
  links?: ContentLink[];
  community_input?: CommunityInputConfig;
  after_vote?: AfterVoteInfo;
}

// --- Status types ---

export type VoteProcessStatus = "draft" | "proposed" | "threshold_met" | "active" | "closed" | "finalized";
export type ProposalProcessStatus = "open" | "closed";

// --- Read layer (UI-facing) ---

/** Shared base for all process summaries */
interface ProcessSummaryBase {
  id: string;
  type: string;
  title: string;
  status: string;
  created_at: string;
  created_by: string;
}

/** Vote summary (from GET /process list) */
export interface VoteSummary extends ProcessSummaryBase {
  type: "civic.vote";
  status: VoteProcessStatus;
  total_votes: number;
  support_count: number;
  support_threshold: number;
  closes_at: string | null;
}

/** Proposal summary (from GET /process list) */
export interface ProposalSummary extends ProcessSummaryBase {
  type: "civic.proposal";
  status: ProposalProcessStatus;
  support_count: number;
  support_threshold: number;
}

/** Vote-results summary as it appears in the public process list. The
 *  public listProcesses endpoint only returns vote-results records with
 *  publication_status === "published"; pending/approved records are
 *  filtered out server-side.
 *
 *  Renamed from PublishedBriefSummary in Slice 8.5. */
export interface PublishedVoteResultsSummary {
  id: string;
  type: "civic.vote_results";
  title: string;
  source_process_id: string;
  publication_status: "published";
  participation_count: number;
  generated_at: string;
  published_at: string;
  created_at: string;
}

export type ProcessSummary = VoteSummary | ProposalSummary | PublishedVoteResultsSummary;

/** Vote detail state */
export interface VoteState {
  id: string;
  type: "civic.vote";
  title: string;
  description: string;
  status: VoteProcessStatus;
  options: string[];
  tally: Record<string, number> | null;
  total_votes: number | null;
  has_voted: boolean | null;
  has_supported: boolean | null;
  support_count: number;
  support_threshold: number;
  activation_mode: "direct" | "proposal_required";
  voting_opens_at: string | null;
  voting_closes_at: string | null;
  closes_at: string | null;
  result: { tally: Record<string, number>; total_votes: number; computed_at: string } | null;
  created_at: string;
  created_by: string;
  jurisdiction?: string;
  content?: ProcessContent;
}

/** Proposal detail state */
export interface ProposalState {
  id: string;
  type: "civic.proposal";
  title: string;
  description: string;
  status: ProposalProcessStatus;
  proposed_options: string[];
  support_count: number;
  support_threshold: number;
  has_supported: boolean | null;
  promoted_vote_id: string | null;
  created_at: string;
  created_by: string;
}

export type ProcessState = VoteState | ProposalState;

export function listProcesses(): Promise<ProcessSummary[]> {
  return request("GET", "/process");
}

export function getProcessState(id: string, actor?: string): Promise<ProcessState> {
  const params = actor ? `?actor=${encodeURIComponent(actor)}` : "";
  return request("GET", `/process/${id}/state${params}`);
}

// --- Actions (internal control surface) ---

export interface ActionResult {
  process: unknown;
  result: Record<string, unknown>;
}

export function submitVote(processId: string, actor: string, option: string): Promise<ActionResult> {
  return request("POST", `/process/${processId}/action`, {
    type: "process.vote",
    actor,
    payload: { option },
  });
}

export function endorseProposal(processId: string, actor: string): Promise<ActionResult> {
  return request("POST", `/process/${processId}/action`, {
    type: "proposal.support",
    actor,
    payload: {},
  });
}

export function supportVote(processId: string, actor: string): Promise<ActionResult> {
  return request("POST", `/process/${processId}/action`, {
    type: "process.support",
    actor,
    payload: {},
  });
}

export function unsupportVote(processId: string, actor: string): Promise<ActionResult> {
  return request("POST", `/process/${processId}/action`, {
    type: "process.unsupport",
    actor,
    payload: {},
  });
}

// --- Civic Proposals (separate from civic.vote process) ---

export type CivicProposalStatus = "submitted" | "endorsed" | "converted" | "archived";

/** Proposal summary (from GET /proposals list) */
export interface CivicProposalSummary {
  id: string;
  title: string;
  description: string;
  submitted_by: string;
  status: CivicProposalStatus;
  support_count: number;
  support_threshold: number;
  created_at: string;
}

/** Proposal detail (from GET /proposals/:id) */
export interface CivicProposalDetail {
  id: string;
  title: string;
  description: string;
  optional_links: string[];
  submitted_by: string;
  status: CivicProposalStatus;
  support_count: number;
  support_threshold: number;
  has_supported: boolean | null;
  created_at: string;
  updated_at: string;
}

/** Submit a new proposal */
export function submitProposal(
  title: string,
  submittedBy: string,
  description?: string,
  optionalLinks?: string[]
): Promise<CivicProposalDetail> {
  return request("POST", "/proposals", {
    title,
    submitted_by: submittedBy,
    description,
    optional_links: optionalLinks,
  });
}

/** List proposals (optional status filter) */
export function listCivicProposals(status?: CivicProposalStatus): Promise<CivicProposalSummary[]> {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  return request("GET", `/proposals${params}`);
}

/** Get proposal detail */
export function getCivicProposal(id: string, actor?: string): Promise<CivicProposalDetail> {
  const params = actor ? `?actor=${encodeURIComponent(actor)}` : "";
  return request("GET", `/proposals/${id}${params}`);
}

/** Support/endorse a proposal */
export function supportCivicProposal(
  proposalId: string,
  userId: string
): Promise<{ support_count: number; status: string }> {
  return request("POST", `/proposals/${proposalId}/support`, { user_id: userId });
}

// --- Admin: Proposal Review ---

/** List proposals for admin review */
export function adminListProposals(status?: string): Promise<CivicProposalSummary[]> {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  return request("GET", `/admin/proposals${params}`);
}

/** Get full proposal detail for admin review */
export function adminGetProposal(id: string): Promise<CivicProposalDetail> {
  return request("GET", `/admin/proposals/${id}`);
}

/** Convert an endorsed proposal to a civic.vote process */
export interface ConvertProposalInput {
  actor: string;
  title?: string;
  description?: string;
  question?: string;
  options?: string[];
  sections?: ContentSection[];
  key_tradeoff?: string;
  learn_more_links?: ContentLink[];
  community_input?: CommunityInputConfig;
  after_vote?: AfterVoteInfo;
  jurisdiction?: string;
  support_threshold?: number;
  voting_duration_ms?: number;
}

export interface ConvertProposalResult {
  message: string;
  proposal_id: string;
  vote_process: {
    id: string;
    title: string;
    status: string;
  };
}

export function convertProposal(
  proposalId: string,
  input: ConvertProposalInput
): Promise<ConvertProposalResult> {
  return request("POST", `/admin/proposals/${proposalId}/convert`, input);
}

/** Archive a proposal */
export function archiveProposal(proposalId: string): Promise<{ message: string }> {
  return request("POST", `/admin/proposals/${proposalId}/archive`);
}

// --- Community Input ---

export interface CommunityInput {
  id: string;
  process_id: string;
  author_id: string;
  body: string;
  submitted_at: string;
  /**
   * Slice 11 — moderation state. Null when the comment has never been
   * moderated. When `hidden` is true and the viewer is not an admin,
   * `body` is empty and `moderation.reason` is null (the reason is
   * internal-audit only). Admin viewers receive the full unredacted
   * record from the same endpoint.
   */
  moderation: CommentModerationView | null;
}

export interface CommentModerationView {
  hidden: boolean;
  hidden_at: string | null;
  hidden_by: string | null;
  reason: string | null;
  restored_at: string | null;
}

export function getInputs(processId: string): Promise<CommunityInput[]> {
  return request("GET", `/process/${processId}/input`);
}

export function submitInput(processId: string, authorId: string, body: string): Promise<CommunityInput> {
  return request("POST", `/process/${processId}/input`, {
    author_id: authorId,
    body,
  });
}

// --- Vote Log & Receipts ---

export interface VoteLogEntry {
  receipt_id: string;
  choice: string;
}

export interface VoteLogResponse {
  process_id: string;
  status: string;
  available: boolean;
  message?: string;
  total_votes?: number;
  log: VoteLogEntry[];
}

export interface ReceiptVerifyResponse {
  found: boolean;
  receipt_id?: string;
  choice?: string;
  message?: string;
}

export function getVoteLog(processId: string): Promise<VoteLogResponse> {
  return request("GET", `/votes/${processId}/log`);
}

export function verifyReceipt(processId: string, receiptId: string): Promise<ReceiptVerifyResponse> {
  return request("GET", `/votes/${processId}/verify?receipt=${encodeURIComponent(receiptId)}`);
}

// --- Civic Events (feed layer) ---
//
// Mirrors civic-hub/src/models/event.ts. Events are the primary public
// interface of the hub; the feed consumes them directly. Keep this shape
// in sync with the backend Civic Event Spec v0.1 model.

export interface CivicEventSource {
  hub_id: string;
  hub_url: string;
}

export interface CivicEventMeta {
  visibility: "public" | "restricted";
}

export interface CivicEvent {
  id: string;
  version: string;
  event_type: string;
  timestamp: string;
  process_id: string;
  actor: string;
  jurisdiction: string;
  action_url: string;
  source: CivicEventSource;
  dedupe_key?: string;
  data: Record<string, unknown>;
  meta: CivicEventMeta;
}

interface EventsResponse {
  events: CivicEvent[];
  count: number;
}

/**
 * Fetch the hub's event feed. Returns all events in descending timestamp
 * order. Pagination is applied client-side in the feed component until the
 * backend grows server-side pagination.
 */
export async function getEvents(): Promise<CivicEvent[]> {
  const res = await request<EventsResponse>("GET", "/events");
  return res.events;
}

// --- Vote results (renamed from "Civic Briefs" in Slice 8.5) ---

export type VoteResultsPublicationStatus = "pending" | "approved" | "published";

export interface VoteResultsPositionBreakdown {
  option_id: string;
  option_label: string;
  count: number;
  percentage: number;
}

/**
 * Snapshot of the original vote captured at vote-results creation time.
 * Optional because legacy records created before Slice 8.5 don't have
 * it. UIs MUST defend against the missing field with a "context not
 * available" fallback.
 */
export interface VoteContextSnapshot {
  description: string;
  options: Array<{ option_id: string; option_label: string }>;
  starts_at: string | null;
  ends_at: string | null;
}

export interface VoteResultsContent {
  title: string;
  participation_count: number;
  position_breakdown: VoteResultsPositionBreakdown[];
  comments: string[];
  admin_notes: string;
  vote_context?: VoteContextSnapshot;
  image_url?: string | null;
  image_alt?: string | null;
}

/** Admin list summary */
export interface VoteResultsSummary {
  id: string;
  type: "civic.vote_results";
  title: string;
  source_process_id: string;
  publication_status: VoteResultsPublicationStatus;
  participation_count: number;
  vote_description_preview?: string;
  generated_at: string;
  approved_at: string | null;
  published_at: string | null;
  created_at: string;
}

/** Admin detail (full record including editable content). */
export interface VoteResultsDetail extends VoteResultsSummary {
  content: VoteResultsContent;
  delivered_to: string[];
  created_by: string;
}

/** Public — returned only when publication_status === "published". */
export interface PublicVoteResults {
  id: string;
  type: "civic.vote_results";
  title: string;
  source_process_id: string;
  participation_count: number;
  position_breakdown: VoteResultsPositionBreakdown[];
  comments: string[];
  admin_notes: string;
  vote_context?: VoteContextSnapshot;
  image_url?: string | null;
  image_alt?: string | null;
  delivered_recipient_count: number;
  approved_at: string | null;
  generated_at: string;
  published_at: string;
}

export interface VoteResultsContentPatch {
  comments?: string[];
  admin_notes?: string;
  image_url?: string | null;
  image_alt?: string | null;
}

export function adminListVoteResults(
  status?: VoteResultsPublicationStatus,
): Promise<VoteResultsSummary[]> {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  return request("GET", `/admin/vote-results${params}`);
}

export function adminGetVoteResults(id: string): Promise<VoteResultsDetail> {
  return request("GET", `/admin/vote-results/${id}`);
}

export function adminPatchVoteResults(
  id: string,
  patch: VoteResultsContentPatch,
): Promise<VoteResultsDetail> {
  return request("PATCH", `/admin/vote-results/${id}`, patch);
}

export function adminApproveVoteResults(
  id: string,
): Promise<{ message: string; vote_results: VoteResultsDetail }> {
  return request("POST", `/admin/vote-results/${id}/approve`);
}

export function getPublicVoteResults(id: string): Promise<PublicVoteResults> {
  return request("GET", `/vote-results/${id}`);
}

// --- Announcements ---

/**
 * Free-form display label for the announcement author ("Admin", "Board
 * member", "Planning Committee", etc.). Server-side admins always get
 * "Admin"; non-admin authors get the label configured in the admin's
 * announcement_authors list. Rendered verbatim on the feed and the
 * public announcement page. Older Slice 4 announcements may carry
 * "board" — renders fine either way.
 */
export type AnnouncementAuthorRole = string;

export interface AnnouncementLink {
  label: string;
  url: string;
}

/** Full read of one announcement (GET /announcement/:id). */
export interface Announcement {
  id: string;
  type: "civic.announcement";
  title: string;
  body: string;
  links: AnnouncementLink[];
  image_url: string | null;
  image_alt: string | null;
  author_id: string;
  author_role: AnnouncementAuthorRole;
  created_at: string;
  last_edited_at: string | null;
  edit_count: number;
  /**
   * Slice 11 — moderation state. Null on never-moderated announcements.
   * When `removed` is true and the viewer is not an admin, the body /
   * image / links fields above are blank and the page renders a
   * tombstone in their place. Admins keep receiving the original
   * content via the same endpoint with their token attached.
   */
  moderation?: AnnouncementModerationView | null;
}

export interface AnnouncementModerationView {
  removed: boolean;
  removed_at: string | null;
  /** Internal-audit only — admin endpoints include this; public read does not. */
  removed_by?: string | null;
  /** Internal-audit only — admin endpoints include this; public read does not. */
  reason?: string | null;
  restored_at: string | null;
}

/** Summary row (GET /announcements). */
export interface AnnouncementSummary {
  id: string;
  type: "civic.announcement";
  title: string;
  image_url: string | null;
  image_alt: string | null;
  author_role: AnnouncementAuthorRole;
  created_at: string;
  last_edited_at: string | null;
  edit_count: number;
}

export interface CreateAnnouncementInput {
  title: string;
  body: string;
  links?: AnnouncementLink[];
  image_url?: string | null;
  image_alt?: string | null;
}

export interface UpdateAnnouncementInput {
  title?: string;
  body?: string;
  links?: AnnouncementLink[];
  /**
   * Set to a string to attach/replace, null to remove, undefined to
   * leave unchanged. Same semantics for image_alt.
   */
  image_url?: string | null;
  image_alt?: string | null;
}

export function createAnnouncement(
  input: CreateAnnouncementInput,
): Promise<Announcement> {
  return request("POST", "/announcement", input);
}

export function updateAnnouncement(
  id: string,
  input: UpdateAnnouncementInput,
): Promise<Announcement> {
  return request("PATCH", `/announcement/${id}`, input);
}

export function getAnnouncement(id: string): Promise<Announcement> {
  return request("GET", `/announcement/${id}`);
}

export function listAnnouncements(limit?: number): Promise<AnnouncementSummary[]> {
  const q = typeof limit === "number" ? `?limit=${limit}` : "";
  return request("GET", `/announcements${q}`);
}

// --- Meeting summaries (Slice 6) ---

export type MeetingSummaryApprovalStatus = "pending" | "approved" | "published";

export interface SummaryBlock {
  topic_title: string;
  topic_summary: string;
  start_time_seconds: number | null;
  action_taken: string | null;
}

/** Admin list row. */
export interface MeetingSummarySummary {
  id: string;
  type: "civic.meeting_summary";
  title: string;
  meeting_title: string;
  meeting_date: string;
  approval_status: MeetingSummaryApprovalStatus;
  block_count: number;
  has_video: boolean;
  generated_at: string;
  approved_at: string | null;
  published_at: string | null;
  edit_count: number;
  created_at: string;
}

/** Admin detail (full read). */
export interface MeetingSummaryDetail extends MeetingSummarySummary {
  source_id: string;
  source_minutes_url: string;
  source_video_url: string | null;
  additional_video_urls: string[];
  blocks: SummaryBlock[];
  admin_notes: string;
  last_edited_at: string | null;
  ai_instructions_used: string;
  ai_model: string;
  ai_attribution_label: string;
  created_by: string;
}

/** Public payload — only returned for published summaries. */
export interface PublicMeetingSummary {
  id: string;
  type: "civic.meeting_summary";
  title: string;
  meeting_title: string;
  meeting_date: string;
  source_minutes_url: string;
  source_video_url: string | null;
  additional_video_urls: string[];
  blocks: SummaryBlock[];
  admin_notes: string;
  generated_at: string;
  published_at: string;
  ai_model: string;
  ai_attribution_label: string;
}

export interface MeetingSummaryPatch {
  meeting_title?: string;
  blocks?: SummaryBlock[];
  admin_notes?: string;
}

export function adminListMeetingSummaries(
  status?: MeetingSummaryApprovalStatus,
): Promise<MeetingSummarySummary[]> {
  const params = status ? `?status=${encodeURIComponent(status)}` : "";
  return request("GET", `/admin/meeting-summaries${params}`);
}

export function adminGetMeetingSummary(
  id: string,
): Promise<MeetingSummaryDetail> {
  return request("GET", `/admin/meeting-summaries/${id}`);
}

export function adminPatchMeetingSummary(
  id: string,
  patch: MeetingSummaryPatch,
): Promise<MeetingSummaryDetail> {
  return request("PATCH", `/admin/meeting-summaries/${id}`, patch);
}

export function adminApproveMeetingSummary(
  id: string,
): Promise<{ message: string; meeting_summary: MeetingSummaryDetail }> {
  return request("POST", `/admin/meeting-summaries/${id}/approve`);
}

export function getMeetingSummary(id: string): Promise<PublicMeetingSummary> {
  return request("GET", `/meeting-summary/${id}`);
}

// --- Admin: hub settings ---

export interface AnnouncementAuthor {
  email: string;
  label: string;
}

export interface AdminSettings {
  brief_recipient_emails: string[];
  announcement_authors: AnnouncementAuthor[];
}

export function adminGetSettings(): Promise<AdminSettings> {
  return request("GET", "/admin/settings");
}

export function adminPatchSettings(
  patch: Partial<AdminSettings>,
): Promise<AdminSettings> {
  return request("PATCH", "/admin/settings", patch);
}

// --- User settings (Slice 5) ---

/**
 * Toggle the user's daily digest subscription. Returns the new value.
 * Requires a valid session token (forwarded via the shared Bearer header
 * in request()). Server always returns the canonical value.
 */
export function setDigestSubscription(
  subscribed: boolean,
): Promise<{ digest_subscribed: boolean }> {
  return request("PATCH", "/user/settings/digest", { subscribed });
}

// --- Slice 9: image upload + link previews ---

export interface UploadedImage {
  url: string;
  width: number;
  height: number;
  mime: string;
}

/**
 * Upload a single image file to the post-images bucket. The caller is
 * responsible for client-side resize / re-encode (see uploadImage in
 * components/PostImagePicker) — this helper only sends the bytes. Auth
 * Bearer token is forwarded automatically.
 */
export async function uploadPostImage(file: Blob): Promise<UploadedImage> {
  const headers: Record<string, string> = {};
  const token = getStoredToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE}/upload/post-image`, {
    method: "POST",
    headers,
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Upload failed: ${res.status}`);
  }
  return res.json();
}

export interface LinkPreviewData {
  url: string;
  canonical_url: string | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  site_name: string | null;
  fetched_at: string;
  error: string | null;
}

/**
 * Fetch a cached or fresh OpenGraph preview for an external URL. Always
 * resolves with a LinkPreviewData object — when `error` is set, the
 * frontend renders a plain link instead of a rich card.
 */
export function getLinkPreview(url: string): Promise<LinkPreviewData> {
  return request("GET", `/link-preview?url=${encodeURIComponent(url)}`);
}

// --- Slice 10.5: full-text search ---

export type SearchTypeKey =
  | "vote"
  | "vote_results"
  | "announcement"
  | "meeting_summary";

export type SearchSort = "relevance" | "newest";

export interface SearchHit {
  process_id: string;
  type: string;
  title: string;
  description: string;
  created_at: string;
  status: string;
  rank: number;
  href: string;
}

export interface SearchResultPage {
  hits: SearchHit[];
  total: number;
  query: {
    q: string;
    types?: SearchTypeKey[];
    from?: string;
    to?: string;
    sort?: SearchSort;
    limit?: number;
    offset?: number;
  };
  took_ms: number;
}

export interface SearchParams {
  q: string;
  types?: SearchTypeKey[];
  from?: string;
  to?: string;
  sort?: SearchSort;
  limit?: number;
  offset?: number;
}

// --- Slice 11: admin moderation ---------------------------------------

export interface ModerationLogEntry {
  event_id: string;
  timestamp: string;
  process_id: string;
  process_title: string | null;
  action: string;
  target_kind: "comment" | "announcement" | null;
  reason: string | null;
  admin: string;
}

export interface ModerationLogResponse {
  entries: ModerationLogEntry[];
  count: number;
}

/** Hide a community-input comment for a Code-of-Conduct violation. */
export function adminHideComment(
  commentId: string,
  reason: string,
): Promise<CommunityInput> {
  return request("POST", `/admin/moderation/comments/${commentId}/hide`, {
    reason,
  });
}

/** Restore a previously hidden comment. */
export function adminRestoreComment(commentId: string): Promise<CommunityInput> {
  return request(
    "POST",
    `/admin/moderation/comments/${commentId}/restore`,
  );
}

/** Remove an announcement (renders a tombstone for non-admin viewers). */
export function adminRemoveAnnouncement(
  processId: string,
  reason: string,
): Promise<Announcement> {
  return request(
    "POST",
    `/admin/moderation/announcements/${processId}/remove`,
    { reason },
  );
}

/** Restore a previously removed announcement. */
export function adminRestoreAnnouncement(
  processId: string,
): Promise<Announcement> {
  return request(
    "POST",
    `/admin/moderation/announcements/${processId}/restore`,
  );
}

/** Newest-first list of every moderation action. Admin-only. */
export function adminGetModerationLog(): Promise<ModerationLogResponse> {
  return request("GET", "/admin/moderation/log");
}

/**
 * Run a full-text search across all post types. Always resolves; an
 * empty `q` short-circuits server-side and returns total: 0 without a
 * DB hit.
 */
export function search(params: SearchParams): Promise<SearchResultPage> {
  const sp = new URLSearchParams();
  if (params.q) sp.set("q", params.q);
  if (params.types && params.types.length > 0) {
    for (const t of params.types) sp.append("type", t);
  }
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.sort) sp.set("sort", params.sort);
  if (typeof params.limit === "number") sp.set("limit", String(params.limit));
  if (typeof params.offset === "number") sp.set("offset", String(params.offset));
  return request("GET", `/search?${sp.toString()}`);
}
