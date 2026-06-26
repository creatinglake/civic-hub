// Deadline helpers — shared, guarded date parsing for lazy deadline-close.
//
// Audit §4 flagged unguarded `new Date(x) <= new Date()` comparisons: when `x`
// is malformed, `new Date(x)` is an Invalid Date and every comparison against
// it is silently `false`, so a past-deadline process would never close. These
// helpers parse defensively so a bad timestamp can't make the close silently
// no-op.

/**
 * True iff `deadline` is a well-formed ISO timestamp strictly in the past.
 *
 * Returns `false` for null/undefined/empty (no deadline set) and for any
 * unparseable string (Date.parse → NaN). Callers treat a `false` result as
 * "do not close", so malformed deadlines fail safe (the process stays open and
 * an admin can intervene) rather than failing silently-open forever past a real
 * deadline.
 */
export function isPastDeadline(
  deadline: string | null | undefined,
  now: number = Date.now(),
): boolean {
  if (!deadline) return false;
  const t = Date.parse(deadline);
  return Number.isFinite(t) && now > t;
}
