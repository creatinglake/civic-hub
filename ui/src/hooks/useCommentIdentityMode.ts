import { useEffect, useState } from "react";
import { getCommentIdentityMode, type CommentIdentityMode } from "../services/api";

/**
 * Fetch the hub's comment identity policy for the composers. Falls back
 * to "anonymous_optional" (the launch default) if the fetch fails — the
 * server re-enforces the real mode on submit either way, so the toggle
 * is only ever cosmetic.
 */
export function useCommentIdentityMode(): CommentIdentityMode {
  const [mode, setMode] = useState<CommentIdentityMode>("anonymous_optional");

  useEffect(() => {
    let cancelled = false;
    getCommentIdentityMode()
      .then(({ mode: m }) => {
        if (!cancelled) setMode(m);
      })
      .catch(() => {
        /* keep the default */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return mode;
}
