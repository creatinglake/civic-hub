import { useSyncExternalStore } from "react";

/**
 * Reactive viewport-width check.
 *
 * Returns true when the viewport is at least 769px wide — the same
 * mobile/desktop cutover used elsewhere in the app (Nav.css's
 * hamburger toggle, Feed.css's image-stacking breakpoint). The value
 * tracks live: rotating a phone or resizing a desktop window
 * triggers a re-render of consumers.
 *
 * Used to gate behaviors that are nice on desktop but friction on
 * mobile — most notably opening external links in a new tab. On
 * narrow viewports the new-tab hand-off loses iOS Safari's "back
 * to Floyd Civic Hub" chip and forces tab-switcher to return to
 * the hub. On wide viewports multi-tab is the dominant research
 * pattern and the friction goes away.
 */
const QUERY = "(min-width: 769px)";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const mq = window.matchMedia(QUERY);
  // addEventListener is the modern API; addListener is the deprecated
  // pre-2020 fallback. Browsers that target this app all support the
  // modern API, but the conditional protects against odd wrappers.
  if (typeof mq.addEventListener === "function") {
    mq.addEventListener("change", callback);
    return () => mq.removeEventListener("change", callback);
  }
  mq.addListener(callback);
  return () => mq.removeListener(callback);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined") return true; // SSR-safe default
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot(): boolean {
  return true; // assume desktop on the server; the hydrator updates on mount
}

export function useIsWideViewport(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
