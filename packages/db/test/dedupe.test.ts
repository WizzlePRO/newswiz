import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { upsertArticles } from '../src/articles.ts';
import type { NormalizedItem } from '../src/articles.ts';
import { closeTestDb, freshTestDb, makeSource } from '../src/testing.ts';
import type pg from 'pg';

let db: pg.Pool;
beforeAll(async () => {
  db = await freshTestDb();
});
afterAll(closeTestDb);

const NOW = new Date('2026-10-22T12:00:00Z');
let n = 0;
function item(o: Partial<NormalizedItem> = {}): NormalizedItem {
  n++;
  const title = o.title ?? `A distinct headline number ${n} about something`;
  return {
    url: `https://example.com/story-${n}`,
    canonicalUrl: `https://example.com/story-${n}`,
    guid: null,
    title,
    titleKey: title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(),
    summary: null,
    author: null,
    section: null,
    imageUrl: null,
    language: null,
    publishedAt: NOW,
    ...o,
  };
}
const count = async (sourceId: number) =>
  (await db.query('SELECT count(*)::int AS n FROM articles WHERE source_id = $1', [sourceId])).rows[0].n as number;

describe('upsertArticles dedupe', () => {
  it('treats the same canonical URL as one article and refreshes changed fields', async () => {
    const { sourceId, feedId } = await makeSource(db);
    const feed = { id: feedId, source_id: sourceId, section: null };
    const a = item({ summary: 'First version' });
    expect(await upsertArticles(db, feed, [a], NOW)).toEqual({ inserted: 1, updated: 0, unchanged: 0 });
    expect(await upsertArticles(db, feed, [{ ...a, url: a.url + '?utm_source=x' }], NOW)).toEqual({ inserted: 0, updated: 0, unchanged: 1 });
    expect(await upsertArticles(db, feed, [{ ...a, summary: 'Updated version' }], NOW)).toEqual({ inserted: 0, updated: 1, unchanged: 0 });
    const { rows } = await db.query('SELECT summary FROM articles WHERE canonical_url = $1', [a.canonicalUrl]);
    expect(rows[0].summary).toBe('Updated version');
  });

  it('matches on the outlet guid even when the URL changes', async () => {
    const { sourceId, feedId } = await makeSource(db);
    const feed = { id: feedId, source_id: sourceId, section: null };
    const a = item({ guid: 'post-123' });
    await upsertArticles(db, feed, [a], NOW);
    const moved = { ...a, url: 'https://example.com/new-slug', canonicalUrl: 'https://example.com/new-slug' };
    expect((await upsertArticles(db, feed, [moved], NOW)).inserted).toBe(0);
    expect(await count(sourceId)).toBe(1);
  });

  it('matches the same long title from the same outlet within 24 hours', async () => {
    const { sourceId, feedId } = await makeSource(db);
    const feed = { id: feedId, source_id: sourceId, section: null };
    const title = 'Senate passes the budget bill after an all-night session';
    await upsertArticles(db, feed, [item({ title })], NOW);
    const repost = item({ title, publishedAt: new Date(NOW.getTime() + 3 * 3600_000) });
    expect((await upsertArticles(db, feed, [repost], NOW)).inserted).toBe(0);
    const nextDay = item({ title, publishedAt: new Date(NOW.getTime() + 30 * 3600_000) });
    expect((await upsertArticles(db, feed, [nextDay], NOW)).inserted).toBe(1);
  });

  it('never merges short, generic titles like "Live updates"', async () => {
    const { sourceId, feedId } = await makeSource(db);
    const feed = { id: feedId, source_id: sourceId, section: null };
    const r = await upsertArticles(db, feed, [item({ title: 'Live updates' }), item({ title: 'Live updates' })], NOW);
    expect(r.inserted).toBe(2);
  });

  it('does not merge the same title across different outlets', async () => {
    const title = 'Hurricane makes landfall on the Gulf Coast tonight';
    const a = await makeSource(db);
    const b = await makeSource(db);
    await upsertArticles(db, { id: a.feedId, source_id: a.sourceId, section: null }, [item({ title })], NOW);
    const r = await upsertArticles(db, { id: b.feedId, source_id: b.sourceId, section: null }, [item({ title })], NOW);
    expect(r.inserted).toBe(1);
  });

  it('collapses duplicates inside one batch and fills the feed section', async () => {
    const { sourceId, feedId } = await makeSource(db);
    const a = item();
    const r = await upsertArticles(db, { id: feedId, source_id: sourceId, section: 'World' }, [a, { ...a }], NOW);
    expect(r).toEqual({ inserted: 1, updated: 0, unchanged: 0 });
    const { rows } = await db.query('SELECT section FROM articles WHERE source_id = $1', [sourceId]);
    expect(rows[0].section).toBe('World');
  });
});
