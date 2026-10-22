import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { closeTestDb, freshTestDb, makeSource } from '@newswiz/db/testing';
import type { Feed, Pool } from '@newswiz/db';
import { PoliteFetcher } from '@newswiz/net';
import { dropRepeatedSummaries, normalizeItems, pollFeed } from '../src/ingest.ts';

const rss = readFileSync(new URL('./fixtures/rss2.xml', import.meta.url), 'utf8');

// A tiny local publisher: serves the fixture with an ETag, can be told to fail, and has a robots.txt.
let mode: 'ok' | 'error' | 'ratelimit' = 'ok';
let requests: { path: string; ifNoneMatch?: string; ua?: string }[] = [];
const server = createServer((req, res) => {
  requests.push({ path: req.url!, ifNoneMatch: req.headers['if-none-match'], ua: req.headers['user-agent'] });
  if (req.url === '/robots.txt') {
    res.end('User-agent: *\nDisallow: /private/\n');
  } else if (mode === 'error') {
    res.writeHead(500).end('boom');
  } else if (mode === 'ratelimit') {
    res.writeHead(429, { 'retry-after': '7200' }).end();
  } else if (req.headers['if-none-match'] === '"v1"') {
    res.writeHead(304).end();
  } else {
    res.writeHead(200, { 'content-type': 'application/rss+xml', etag: '"v1"' }).end(rss);
  }
});

let db: Pool;
let base: string;
const NOW = new Date('2026-10-22T13:00:00Z');

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  db = await freshTestDb();
});
afterAll(async () => {
  server.close();
  await closeTestDb();
});
beforeEach(() => {
  mode = 'ok';
  requests = [];
});

async function loadFeed(id: number): Promise<Feed & { last_error: string | null; next_poll_at: Date }> {
  const { rows } = await db.query('SELECT * FROM feeds WHERE id = $1', [id]);
  return rows[0];
}

describe('pollFeed', () => {
  it('stores new articles, then uses the ETag and gets 304 on the next poll', async () => {
    const { feedId } = await makeSource(db, { feedUrl: `${base}/feed.xml` });
    const fetcher = new PoliteFetcher('NewsWiz/test (+https://example.com)');

    const first = await pollFeed(db, fetcher, await loadFeed(feedId), NOW);
    expect(first).toMatchObject({ ok: true, status: 200, items: 3 });
    expect(first.upsert).toEqual({ inserted: 3, updated: 0, unchanged: 0 });
    expect(requests.find((r) => r.path === '/feed.xml')?.ua).toBe('NewsWiz/test (+https://example.com)');

    const second = await pollFeed(db, fetcher, await loadFeed(feedId), NOW);
    expect(second).toMatchObject({ ok: true, status: 304 });
    expect(requests.filter((r) => r.path === '/feed.xml').at(-1)?.ifNoneMatch).toBe('"v1"');

    const { rows } = await db.query('SELECT count(*)::int AS n FROM articles');
    expect(rows[0].n).toBe(3);
  });

  it('backs off after errors and resets after a success', async () => {
    const { feedId } = await makeSource(db, { feedUrl: `${base}/flaky.xml` });
    const fetcher = new PoliteFetcher('NewsWiz/test');
    mode = 'error';
    const fail1 = await pollFeed(db, fetcher, await loadFeed(feedId), NOW);
    const fail2 = await pollFeed(db, fetcher, await loadFeed(feedId), NOW);
    expect(fail1).toMatchObject({ ok: false, status: 500, error: 'HTTP 500' });
    expect(fail2.nextPollAt.getTime()).toBeGreaterThan(fail1.nextPollAt.getTime());
    expect((await loadFeed(feedId)).consecutive_failures).toBe(2);

    mode = 'ok';
    await pollFeed(db, fetcher, await loadFeed(feedId), NOW);
    const after = await loadFeed(feedId);
    expect(after.consecutive_failures).toBe(0);
    expect(after.last_error).toBeNull();
  });

  it('waits at least as long as Retry-After on a 429', async () => {
    const { feedId } = await makeSource(db, { feedUrl: `${base}/busy.xml` });
    mode = 'ratelimit';
    const r = await pollFeed(db, new PoliteFetcher('NewsWiz/test'), await loadFeed(feedId), NOW);
    expect(r.ok).toBe(false);
    expect(r.nextPollAt.getTime() - NOW.getTime()).toBeGreaterThanOrEqual(7200 * 1000);
  });

  it('never fetches a URL that robots.txt disallows', async () => {
    const { feedId } = await makeSource(db, { feedUrl: `${base}/private/feed.xml` });
    const r = await pollFeed(db, new PoliteFetcher('NewsWiz/test'), await loadFeed(feedId), NOW);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining('robots.txt') });
    expect(requests.some((q) => q.path.startsWith('/private/'))).toBe(false);
  });
});

describe('normalizeItems', () => {
  const item = (o: Partial<Parameters<typeof normalizeItems>[0][number]>) => ({
    url: 'https://example.com/a', guid: null, title: 'A story title that is long enough', summary: null,
    author: null, section: null, imageUrl: null, language: null, publishedAt: NOW, ...o,
  });

  it('skips week-old items and clamps future dates', () => {
    const out = normalizeItems(
      [
        item({ url: 'https://example.com/old', publishedAt: new Date('2026-10-01T00:00:00Z') }),
        item({ url: 'https://example.com/future', publishedAt: new Date('2027-01-01T00:00:00Z') }),
      ],
      { section: 'World' },
      NOW,
    );
    expect(out.map((i) => i.url)).toEqual(['https://example.com/future']);
    expect(out[0]!.publishedAt).toEqual(NOW);
    expect(out[0]!.section).toBe('World');
  });

  it('drops a promo paragraph repeated across a feed', () => {
    const promo = 'Example is a nonprofit newsroom covering education. Sign up for our newsletter to get stories.';
    const items = [1, 2, 3, 4].map((n) => item({ url: `https://example.com/${n}`, summary: promo }));
    items.push(item({ url: 'https://example.com/5', summary: 'A real, specific teaser for this one story.' }));
    expect(dropRepeatedSummaries(items).map((i) => i.summary)).toEqual([null, null, null, null, 'A real, specific teaser for this one story.']);
  });
});
