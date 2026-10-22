import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FeedParseError, parseDate, parseFeed, summarize, SUMMARY_MAX_CHARS } from '../src/parse.ts';

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseFeed: RSS 2.0', () => {
  const items = parseFeed(fixture('rss2.xml'), 'https://www.example.com/feed');

  it('skips items without a title', () => {
    expect(items.map((i) => i.title)).toEqual([
      'City council approves & funds new transit line',
      'Wildfire forces evacuations',
      'Item with only a permalink guid',
    ]);
  });

  it('reads core fields, decoding entities and CDATA', () => {
    const [first] = items;
    expect(first).toMatchObject({
      url: 'https://www.example.com/news/2026/10/transit-line?utm_source=rss&utm_medium=feed',
      guid: 'ex-1001',
      author: 'Jane Reporter',
      section: 'Local',
      language: 'en-us',
      imageUrl: 'https://cdn.example.com/large.jpg',
    });
    expect(first!.publishedAt?.toISOString()).toBe('2026-10-22T12:00:00.000Z');
  });

  it('strips HTML and WordPress boilerplate from summaries', () => {
    expect(items[0]!.summary).toBe('The council voted 7–2 to fund the line.');
  });

  it('falls back to content:encoded, dropping headings, figures, and the repeated title', () => {
    expect(items[1]!.summary).toBe(
      'Thousands of residents were told to leave their homes on Thursday as a fast-moving fire spread.',
    );
    expect(items[1]!.imageUrl).toBe('https://www.example.com/img/fire.jpg');
  });

  it('parses "email (Name)" authors', () => {
    expect(items[1]!.author).toBe('News Desk');
  });

  it('uses a permalink guid as the URL and reads enclosure images', () => {
    expect(items[2]).toMatchObject({
      url: 'https://www.example.com/news/guid-only',
      imageUrl: 'https://cdn.example.com/guid.png',
      summary: null, // "Short" is too short to be a real summary
    });
    expect(items[2]!.publishedAt?.toISOString()).toBe('2026-10-22T10:00:00.000Z'); // BST = +0100
  });
});

describe('parseFeed: other formats', () => {
  it('parses Atom, resolving relative links and picking the alternate link', () => {
    const [entry] = parseFeed(fixture('atom.xml'), 'https://www.example.org/feed.atom');
    expect(entry).toMatchObject({
      url: 'https://www.example.org/articles/ocean-currents-123',
      guid: 'tag:example.org,2026:123',
      title: 'Scientists map deep ocean currents',
      summary: 'New measurements reveal how heat moves through the deep ocean.',
      author: 'Dr. Ada Ocean',
      section: 'Science',
      imageUrl: 'https://cdn.example.org/ocean.jpg',
      language: 'en',
    });
    expect(entry!.publishedAt?.toISOString()).toBe('2026-10-21T21:08:23.000Z');
  });

  it('parses RSS 1.0 (RDF)', () => {
    const [item] = parseFeed(fixture('rdf.xml'), 'https://www.example.de/rss');
    expect(item).toMatchObject({
      url: 'https://www.example.de/en/border-unrest/a-1',
      guid: 'https://www.example.de/en/border-unrest/a-1',
      section: 'World',
      language: 'en',
    });
  });

  it('parses Google News sitemaps, skipping non-news URLs', () => {
    const items = parseFeed(fixture('news-sitemap.xml'), 'https://www.example.com/news-sitemap.xml');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: 'https://www.example.com/story/news/2026/10/22/teen-plot/123/',
      title: 'Teens plotted for months, police say',
      imageUrl: 'https://cdn.example.com/teen.jpg',
      language: 'en',
      summary: null,
    });
  });

  it('rejects HTML pages and garbage with a FeedParseError', () => {
    expect(() => parseFeed(fixture('page.html'), 'https://x.test/')).toThrow(FeedParseError);
    expect(() => parseFeed('<foo><bar>', 'https://x.test/')).toThrow(FeedParseError);
    expect(() => parseFeed('<sitemapindex></sitemapindex>', 'https://x.test/')).toThrow(/sitemap index/);
  });
});

describe('summarize', () => {
  it('truncates long text at a word boundary with an ellipsis', () => {
    const s = summarize(`<p>${'word '.repeat(200)}</p>`)!;
    expect(s.length).toBeLessThanOrEqual(SUMMARY_MAX_CHARS + 1);
    expect(s.endsWith('word…')).toBe(true);
  });
});

describe('parseDate', () => {
  it.each([
    ['Thu, 22 Oct 2026 05:45:00 EDT', '2026-10-22T09:45:00.000Z'],
    ['2026-10-22T12:20:27.107Z', '2026-10-22T12:20:27.107Z'],
    ['Thu, 22 Oct 2026 11:00:00 AEST', '2026-10-22T01:00:00.000Z'],
  ])('%s', (raw, iso) => {
    expect(parseDate(raw)?.toISOString()).toBe(iso);
  });

  it('returns null for nonsense', () => {
    expect(parseDate('yesterday-ish')).toBeNull();
    expect(parseDate(undefined)).toBeNull();
  });
});

describe('summarize boilerplate', () => {
  it('removes a trailing "Read more" link text but not words ending in "read"', () => {
    expect(summarize('<p>The fire continued to spread.</p>')).toBe('The fire continued to spread.');
    expect(summarize('<p>Officials gave an update on the outbreak. Read more</p>')).toBe('Officials gave an update on the outbreak.');
    expect(summarize('<p>Officials gave an update on the outbreak. Continue reading...</p>')).toBe('Officials gave an update on the outbreak.');
  });
});
