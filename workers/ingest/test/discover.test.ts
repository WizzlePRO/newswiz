import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  approveCandidate, findDiscoveryLeads, listCandidates, recordLinkMentions, rejectCandidate,
} from '@newswiz/db';
import type { Pool } from '@newswiz/db';
import { closeTestDb, freshTestDb, makeSource } from '@newswiz/db/testing';
import { PoliteFetcher } from '@newswiz/net';
import { evaluateLead, findFeedLinks, guessAccess, siteName } from '../src/discover.ts';
import { mentionsFrom } from '../src/mentions.ts';
import { extractLinks } from '../src/parse.ts';

describe('mentionsFrom', () => {
  it('keeps links to other outlets and drops own pages, platforms, and official sites', () => {
    const links = [
      'https://www.othernews.com/story/1',
      'https://video.example.com/clip', // the outlet's own subdomain
      'https://twitter.com/someone/status/1',
      'https://www.cdc.gov/report',
      'https://news.yahoo.com/republished',
      'https://m.localpaper.org/a#comments',
    ];
    expect(mentionsFrom('https://www.example.com/a', links, 'https://feeds.example.com/rss')).toEqual([
      { domain: 'othernews.com', url: 'https://www.othernews.com/story/1' },
      { domain: 'localpaper.org', url: 'https://m.localpaper.org/a' },
    ]);
  });

  it('pulls absolute links out of item HTML', () => {
    expect(extractLinks('<p>As <a href="https://other.com/x">Other</a> and <a href="/own">we</a> reported</p>', 'https://me.com/a')).toEqual([
      'https://other.com/x',
      'https://me.com/own',
    ]);
  });
});

describe('page helpers', () => {
  const home = `<html><head>
    <title>Valley Ledger | Independent news for the valley</title>
    <meta property="og:site_name" content="The Valley Ledger">
    <link rel="alternate" type="application/rss+xml" title="Valley Ledger » Feed" href="/feed/">
    <link rel="alternate" type="application/rss+xml" title="Valley Ledger » Comments Feed" href="/comments/feed/">
    <link rel="stylesheet" href="/style.css">
  </head></html>`;

  it('finds advertised feeds but not comment feeds', () => {
    expect(findFeedLinks(home, 'https://valleyledger.com/')).toEqual(['https://valleyledger.com/feed/']);
  });

  it('prefers og:site_name for the outlet name', () => {
    expect(siteName(home)).toBe('The Valley Ledger');
    expect(siteName('<title>Metro Times - Home</title>')).toBe('Metro Times');
  });

  it('guesses access from the sample article', () => {
    const ld = (free: boolean) => `<script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":${free}}</script>`;
    expect(guessAccess(ld(false)).guess).toBe('paywalled');
    expect(guessAccess(ld(true))).toMatchObject({ guess: 'free', evidence: { newsTypes: ['NewsArticle'] } });
    expect(guessAccess('<script src="https://cdn.tinypass.com/api/tinypass.min.js"></script>')).toMatchObject({
      guess: 'metered',
      evidence: { paywallVendors: ['Piano'] },
    });
    expect(guessAccess('<p>plain</p>').guess).toBe('unknown');
  });
});

// A small local "outlet" with a homepage, a fresh feed, and an article page.
const NOW = new Date('2026-10-22T13:00:00Z');
const fixture = readFileSync(new URL('./fixtures/rss2.xml', import.meta.url), 'utf8');
let base = '';
const server = createServer((req, res) => {
  if (req.url === '/robots.txt') return res.end('User-agent: *\nAllow: /\n');
  if (req.url === '/') {
    return res.end(`<html><head><meta property="og:site_name" content="Valley Ledger">
      <link rel="alternate" type="application/rss+xml" href="/feed/"></head></html>`);
  }
  if (req.url === '/feed/') {
    // Point the fixture's article links at this server so the sample article can be fetched.
    return res.writeHead(200, { 'content-type': 'application/rss+xml' }).end(fixture.replaceAll('https://www.example.com', `http://${base}`));
  }
  res.end(`<html><script type="application/ld+json">{"@type":"NewsArticle","isAccessibleForFree":true}</script></html>`);
});

describe('evaluateLead', () => {
  beforeAll(async () => {
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => server.close());

  it('finds the feed, checks it is fresh, and samples an article', async () => {
    // evaluateLead uses https://domain/; point it at the local http server instead.
    const fetcher = new PoliteFetcher('NewsWiz/test');
    const get = fetcher.get.bind(fetcher);
    fetcher.get = (url, opts) => get(url.replace(`https://${base}`, `http://${base}`), opts);

    const c = await evaluateLead(fetcher, { domain: base, cited_by: ['A', 'B'], mention_count: 4, sample_url: '' }, NOW);
    expect(c).toMatchObject({
      status: 'pending',
      name: 'Valley Ledger',
      feed_url: `http://${base}/feed/`,
      feed_items: 3,
      access_guess: 'free',
      cited_by: ['A', 'B'],
    });
    expect(c.sample_titles).toHaveLength(3);
  });

  it('rejects a site whose feed is stale', async () => {
    const fetcher = new PoliteFetcher('NewsWiz/test');
    const get = fetcher.get.bind(fetcher);
    fetcher.get = (url, opts) => get(url.replace(`https://${base}`, `http://${base}`), opts);
    const later = new Date('2026-12-01T00:00:00Z');
    const c = await evaluateLead(fetcher, { domain: base, cited_by: ['A', 'B'], mention_count: 2, sample_url: '' }, later);
    expect(c).toMatchObject({ status: 'invalid', invalid_reason: 'feed has nothing from the past week' });
  });
});

describe('discovery leads and review', () => {
  let db: Pool;
  beforeAll(async () => {
    db = await freshTestDb();
  });
  afterAll(closeTestDb);

  it('suggests a domain only when two or more outlets cite it, and never one already followed', async () => {
    const a = await makeSource(db, { slug: 'alpha' });
    const b = await makeSource(db, { slug: 'beta' });
    await db.query(`UPDATE sources SET homepage = 'https://www.alpha.com' WHERE slug = 'alpha'`);
    await recordLinkMentions(db, a.sourceId, [
      { domain: 'newoutlet.com', url: 'https://newoutlet.com/1' },
      { domain: 'onlyonce.com', url: 'https://onlyonce.com/1' },
    ]);
    await recordLinkMentions(db, b.sourceId, [
      { domain: 'newoutlet.com', url: 'https://newoutlet.com/2' },
      { domain: 'alpha.com', url: 'https://alpha.com/x' },
      { domain: 'news.alpha.com', url: 'https://news.alpha.com/y' },
    ]);
    const leads = await findDiscoveryLeads(db);
    expect(leads.map((l) => l.domain)).toEqual(['newoutlet.com']);
    expect(leads[0]!.cited_by).toEqual(['alpha', 'beta']);
  });

  it('adds an approved candidate as a source with its feed, and never re-suggests dismissed ones', async () => {
    const { rows } = await db.query(
      `INSERT INTO source_candidates (domain, name, homepage, feed_url, status, cited_by, access_guess)
       VALUES ('newoutlet.com', 'New Outlet', 'https://newoutlet.com/', 'https://newoutlet.com/feed/', 'pending', '{alpha,beta}', 'free'),
              ('meh.com', 'Meh', 'https://meh.com/', 'https://meh.com/feed/', 'pending', '{alpha,beta}', 'unknown')
       RETURNING id`,
    );
    const added = await approveCandidate(db, rows[0].id, {
      name: 'New Outlet', access_model: 'free', ownership_type: 'nonprofit', user_bias_lean: 'center',
    });
    expect(added).toEqual({ slug: 'newoutlet' });
    const src = await db.query(
      `SELECT s.access_model, s.ownership_type, s.user_bias_lean, f.url FROM sources s JOIN feeds f ON f.source_id = s.id WHERE s.slug = 'newoutlet'`,
    );
    expect(src.rows[0]).toEqual({ access_model: 'free', ownership_type: 'nonprofit', user_bias_lean: 'center', url: 'https://newoutlet.com/feed/' });

    expect(await rejectCandidate(db, rows[1].id)).toBe(true);
    await recordLinkMentions(db, 1, [{ domain: 'meh.com', url: 'https://meh.com/again' }]);
    await recordLinkMentions(db, 2, [{ domain: 'meh.com', url: 'https://meh.com/again2' }]);
    expect((await findDiscoveryLeads(db)).map((l) => l.domain)).not.toContain('meh.com');
    expect(await listCandidates(db, 'pending')).toEqual([]);
  });
});
