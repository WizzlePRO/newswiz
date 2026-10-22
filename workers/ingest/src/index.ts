export { canonicalUrl, titleKey } from './canonical.ts';
export { parseFeed, FeedParseError, summarize, parseDate, cleanText, SUMMARY_MAX_CHARS } from './parse.ts';
export { computeNextPoll, MAX_BACKOFF_MINUTES } from './schedule.ts';
export { pollFeed, runCycle, normalizeItems, dropRepeatedSummaries, MAX_ITEM_AGE_DAYS } from './ingest.ts';
export type { PollReport } from './ingest.ts';
export { runDiscovery, maybeRunDailyDiscovery, evaluateLead, findFeedLinks, siteName, guessAccess } from './discover.ts';
export { mentionsFrom, normalizeDomain, isCandidateDomain } from './mentions.ts';
