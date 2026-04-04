// civic.vote module — result computation
//
// Pure functions for tallying votes and producing structured results.

import type { VoteResult } from "./models.js";

export function computeTally(
  votes: Record<string, string>,
  options: string[]
): VoteResult {
  const tally: Record<string, number> = {};
  for (const option of options) {
    tally[option] = 0;
  }
  for (const option of Object.values(votes)) {
    if (tally[option] !== undefined) {
      tally[option]++;
    }
  }

  return {
    tally,
    total_votes: Object.keys(votes).length,
    computed_at: new Date().toISOString(),
  };
}
