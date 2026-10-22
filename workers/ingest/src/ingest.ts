import { claimDueFeeds, recordFeedResult, recordLinkMentions, upsertArticles } from '@newswiz/db';
import type { Feed, NormalizedItem, ParsedItem, Pool, UpsertResult } from '@newswiz/db';
import type { PoliteFetcher } from '@newswiz/net';
import { canonicalUrl, titleKey } from './canonical.ts';
import { mentionsFrom } from './mentions.ts';
import { FeedParseError, parseFeed } from './parse.ts';
import { computeNextPoll } from './schedule.ts';

/** Items older than this are skipped: this is a news reader, not an archive. */
export const MAX_ITEM_AGE_DAYS = 7;
/** Publish dates further in the future than this are clamped to "now". */
const FUTURE_TOLERANCE_MS = 60 * 60 * 1000;

export interface PollReport {
  feedId: number;
  url: string;
  ok: boolean;
  status: number | null;
  error: string | null;
  items: number;
  upsert: UpsertResult | null;
  nextPollAt: Date;
}

/**
 * Some feeds put the same promo paragraph ("X is a nonprofit newsroom...") in every item's
 * description. A summary prefix shared by several items is boilerplate, not a teaser.
 */
export function dropRepeatedSummaries<T extends { summary: string | null }>(items: T[]): T[] {
  const prefix = (s: string) => s.slice(0, 80);
  const counts = new Map<string, number>();
  for (const i of items) if (i.summary) counts.set(prefix(i.summary), (counts.get(prefix(i.summary)) ?? 0) + 1);
  const threshold = Math.max(3, Math.ceil(items.length * 0.25));
  return items.map((i) => (i.summary && counts.get(prefix(i.summary))! >= threshold ? { ...i, summary: null } : i));
}

export function normalizeItems(items: ParsedItem[], feed: Pick<Feed, 'section'>, now: Date): NormalizedItem[] {
  const oldest = now.getTime() - MAX_ITEM_AGE_DAYS * 24 * 60 * 60 * 1000;
  return dropRepeatedSummaries(items).flatMap((item) => {
    let publishedAt = item.publishedAt;
    if (publishedAt && publishedAt.getTime() < oldest) return [];
    if (publishedAt && publishedAt.getTime() > now.getTime() + FUTURE_TOLERANCE_MS) publishedAt = now;
    return [{
      ...item,
      publishedAt,
      section: feed.section ?? item.section,
      canonicalUrl: canonicalUrl(item.url),
      titleKey: titleKey(item.title),
    }];
  });
}

/** Fetch one feed, store its new articles, and schedule its next poll. Never throws for feed problems. */
export async function pollFeed(db: Pool, fetcher: PoliteFetcher, feed: Feed, now = new Date()): Promise<PollReport> {
  const accept = feed.kind === 'news_sitemap' ? 'application/xml, text/xml;q=0.9, */*;q=0.5' : undefined;
  const res = await fetcher.get(feed.url, { etag: feed.etag, lastModified: feed.last_modified, accept });
  const crawlDelaySeconds = await fetcher.robots.crawlDelay(feed.url).catch(() => undefined);

  let ok = false;
  let status: number | null = null;
  let error: string | null = null;
  let retryAfterSeconds: number | null = null;
  let items = 0;
  let upsert: UpsertResult | null = null;
  let etag: string | null = null;
  let lastModified: string | null = null;

  switch (res.kind) {
    case 'ok':
      status = res.status;
      try {
        const normalized = normalizeItems(parseFeed(res.body, res.finalUrl), feed, now);
        items = normalized.length;
        upsert = await upsertArticles(db, feed, normalized, now);
        await recordLinkMentions(db, feed.source_id, normalized.flatMap((i) => mentionsFrom(i.url, i.links, feed.url)));
        ok = true;
        etag = res.etag;
        lastModified = res.lastModified;
      } catch (err) {
        if (!(err instanceof FeedParseError)) throw err;
        error = err.message;
      }
      break;
    case 'not_modified':
      ok = true;
      status = 304;
      break;
    case 'disallowed':
      error = res.reason;
      break;
    case 'http_error':
      status = res.status;
      error = `HTTP ${res.status}`;
      retryAfterSeconds = res.retryAfterSeconds;
      break;
    case 'network_error':
      error = `network error: ${res.message}`;
      break;
  }

  const nextPollAt = computeNextPoll({
    now,
    intervalMinutes: feed.poll_interval_minutes,
    consecutiveFailures: ok ? 0 : feed.consecutive_failures + 1,
    retryAfterSeconds,
    crawlDelaySeconds,
  });
  await recordFeedResult(db, feed.id, { ok, status, error, etag, lastModified, nextPollAt, polledAt: now });
  return { feedId: feed.id, url: feed.url, ok, status, error, items, upsert, nextPollAt };
}

/**
 * Claim every due feed and poll them: up to `concurrency` hosts at once, but only one request
 * at a time per host, spaced by the host's Crawl-delay (at least one second).
 */
export async function runCycle(
  db: Pool,
  fetcher: PoliteFetcher,
  opts: { concurrency: number; batchSize?: number; onReport?: (r: PollReport) => void },
): Promise<PollReport[]> {
  const feeds = await claimDueFeeds(db, opts.batchSize ?? 100);
  const byHost = new Map<string, Feed[]>();
  for (const feed of feeds) {
    const host = new URL(feed.url).host;
    byHost.set(host, [...(byHost.get(host) ?? []), feed]);
  }
  const queues = [...byHost.values()];
  const reports: PollReport[] = [];

  const worker = async () => {
    for (let queue = queues.shift(); queue; queue = queues.shift()) {
      for (const [i, feed] of queue.entries()) {
        if (i > 0) {
          const delay = (await fetcher.robots.crawlDelay(feed.url).catch(() => undefined)) ?? 1;
          await new Promise((r) => setTimeout(r, Math.min(delay, 60) * 1000));
        }
        try {
          const report = await pollFeed(db, fetcher, feed);
          reports.push(report);
          opts.onReport?.(report);
        } catch (err) {
          // A bug or database error, not a feed problem. Log it; the claim lease retries later.
          console.error(`feed ${feed.id} (${feed.url}) crashed:`, err);
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, worker));
  return reports;
}
