import { describe, expect, it } from 'vitest';
import { parseRetryAfter } from '../src/fetch.ts';
import { RobotsCache } from '../src/robots.ts';

const fakeFetch = (status: number, body = '') =>
  (async () => new Response(body, { status })) as unknown as typeof fetch;

describe('RobotsCache', () => {
  it('applies Disallow rules for our user agent', async () => {
    const robots = new RobotsCache('NewsWiz/1.0', fakeFetch(200, 'User-agent: *\nDisallow: /private/\nCrawl-delay: 5'));
    expect(await robots.check('https://a.test/news/1')).toEqual({ allowed: true });
    expect((await robots.check('https://a.test/private/x')).allowed).toBe(false);
    expect(await robots.crawlDelay('https://a.test/')).toBe(5);
  });

  it('treats a missing robots.txt (4xx) as allow-all', async () => {
    expect(await new RobotsCache('NewsWiz/1.0', fakeFetch(404)).check('https://b.test/x')).toEqual({ allowed: true });
  });

  it('stays away when robots.txt errors (5xx)', async () => {
    expect((await new RobotsCache('NewsWiz/1.0', fakeFetch(503)).check('https://c.test/x')).allowed).toBe(false);
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds and HTTP dates', () => {
    expect(parseRetryAfter('120')).toBe(120);
    expect(parseRetryAfter('Thu, 22 Oct 2026 12:10:00 GMT', Date.parse('2026-10-22T12:00:00Z'))).toBe(600);
    expect(parseRetryAfter('soon')).toBeNull();
  });
});
