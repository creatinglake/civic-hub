// civic.search — type definitions
//
// Service module (not a process type). Same plug-in style as
// civic.digest and civic.link_preview: pure functions with injected
// dependencies, no Express, no DB, no environment access. The host
// hub registers a route handler that wires this module to Supabase
// RPC functions.
//
// A hub that doesn't want search simply doesn't mount the route —
// announcements / votes / meetings still work; only `/search` returns
// 404.

/** Public-facing post-type filter values. Wire format kept short so
 *  query strings stay readable: `?type=vote&type=announcement`. The
 *  controller maps these to the internal civic.* type identifiers. */
export type SearchTypeKey =
  | "vote"
  | "vote_results"
  | "announcement"
  | "meeting_summary";

export type SearchSort = "relevance" | "newest";

export interface SearchQuery {
  q: string;
  types?: SearchTypeKey[];
  /** ISO 8601 — inclusive lower bound on created_at. */
  from?: string | null;
  /** ISO 8601 — inclusive upper bound on created_at. */
  to?: string | null;
  sort?: SearchSort;
  /** Default 25, max 100. */
  limit?: number;
  /** Default 0. */
  offset?: number;
}

/** Validated, normalized form of SearchQuery — what the controller
 *  passes to its RPC executor. Differs from SearchQuery in that it has
 *  defaults filled in and types coerced to the internal civic.* names. */
export interface SearchFilters {
  q: string;
  internalTypes: string[] | null; // e.g. ["civic.announcement", "civic.vote"]
  from: string | null;
  to: string | null;
  sort: SearchSort;
  limit: number;
  offset: number;
}

export interface SearchHit {
  process_id: string;
  type: string;          // internal civic.* type identifier
  title: string;
  description: string;
  created_at: string;
  status: string;
  rank: number;
  href: string;          // canonical UI route for this post
}

export interface SearchResultPage {
  hits: SearchHit[];
  total: number;
  query: SearchQuery;
  took_ms: number;
}

/** Row shape returned by the host hub's RPC executor. Mirrors the
 *  return type of search_processes() in the migration. The module
 *  doesn't know how the row was sourced; it just formats it. */
export interface SearchHitRow {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: string;
  state?: Record<string, unknown> | null;
  created_at: string;
  rank: number;
}

/** Injected callback for the actual SQL execution. Returns the row
 *  set in rank-or-newest order, already paginated. */
export type SearchExecuteFn = (filters: SearchFilters) => Promise<SearchHitRow[]>;

/** Injected callback for the count query. */
export type SearchCountFn = (filters: SearchFilters) => Promise<number>;

/** Hard limits on user-supplied values. Validated in service.ts. */
export const SEARCH_LIMIT_DEFAULT = 25;
export const SEARCH_LIMIT_MAX = 100;
export const SEARCH_OFFSET_MAX = 10_000;
