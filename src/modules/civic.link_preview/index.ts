// civic.link_preview — public surface.
//
// The host hub registers no process type for this module — it is a
// service-only module like civic.digest. Wire it up by:
//   1. Implementing the FetchHtmlFn callback (see api/services/...)
//   2. Calling fetchLinkPreview() from a controller behind a cache.

export type { FetchHtmlFn, LinkPreview } from "./models.js";
export {
  DEFAULT_USER_AGENT,
  FETCH_MAX_REDIRECTS,
  FETCH_TIMEOUT_MS,
  PREVIEW_TTL_ERROR_MS,
  PREVIEW_TTL_SUCCESS_MS,
} from "./models.js";

export { extractUrls, fetchLinkPreview, validatePreviewUrl } from "./service.js";
export { parseHtmlToPreview } from "./scraper.js";
