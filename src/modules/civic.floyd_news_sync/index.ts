// civic.floyd_news_sync — public surface

export type {
  FloydNewsEntry,
  FloydNewsSyncConfig,
} from "./models.js";

export {
  parseRssFeed,
  parseEventDate,
  parseRfc822ToIso,
  isFutureOrUndated,
} from "./connector.js";

export {
  discoverNewsEntries,
  type DiscoverDeps,
  type FetchTextFn,
} from "./pipeline.js";
