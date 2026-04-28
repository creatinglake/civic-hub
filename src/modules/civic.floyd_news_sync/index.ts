// civic.floyd_news_sync — public surface

export type {
  FloydNewsEntry,
  FloydNewsSyncConfig,
} from "./models.js";

export {
  trimNewsHtml,
  isValidEntry,
  isFutureOrUndated,
} from "./connector.js";

export { buildDiscoveryPrompt } from "./prompts.js";

export {
  discoverNewsEntries,
  type CallClaudeFn,
  type FetchHtmlFn,
  type DiscoverDeps,
} from "./pipeline.js";
