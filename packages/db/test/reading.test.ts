import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type pg from 'pg';
import { finishCycle, getCycleStart, MAX_CYCLE_LOOKBACK_HOURS } from '../src/cycle.ts';
import { listInProgress, listSaved, updateReadingState } from '../src/reading.ts';
import { closeTestDb, freshTestDb, makeSource } from '../src/testing.ts';

let db: pg.Pool;
let articleId: number;
beforeAll(async () => {
  db = await freshTestDb();
  const { sourceId, feedId } = await makeSource(db);
  const { rows } = await db.query(
    `INSERT INTO articles (source_id, feed_id, url, canonical_url, title, title_key)
     VALUES ($1, $2, 'https://x.test/a', 'https://x.test/a', 'A', 'a') RETURNING id`,
    [sourceId, feedId],
  );
  articleId = rows[0].id;
});
afterAll(closeTestDb);

describe('reading state', () => {
  it('saves, then tracks reader-view progress forward only', async () => {
    await updateReadingState(db, articleId, { saved: true });
    let s = await updateReadingState(db, articleId, { progress: 0.4, block: 12, progressSource: 'reader' });
    expect(s).toMatchObject({ progress: expect.closeTo(0.4, 5), progress_block: 12 });
    expect(s!.opened_at).not.toBeNull();
    // Scrolling back up to re-read doesn't lose your place.
    s = await updateReadingState(db, articleId, { progress: 0.2, block: 5, progressSource: 'reader' });
    expect(s).toMatchObject({ progress: expect.closeTo(0.4, 5), progress_block: 12 });
    expect((await listInProgress(db)).map((a) => a.id)).toEqual([articleId]);
  });

  it('lets a manual setting move progress backward', async () => {
    const s = await updateReadingState(db, articleId, { progress: 0.25, progressSource: 'manual' });
    expect(s).toMatchObject({ progress: 0.25, progress_source: 'manual', read_at: null });
  });

  it('marks finished near the end, and "mark unread" resets', async () => {
    let s = await updateReadingState(db, articleId, { progress: 0.98, block: 70 });
    expect(s!.read_at).not.toBeNull();
    expect(await listInProgress(db)).toEqual([]);
    s = await updateReadingState(db, articleId, { read: false });
    expect(s).toMatchObject({ read_at: null, progress: 0, progress_block: null });
    expect(s!.saved_at).not.toBeNull();
  });

  it('lists saved articles and drops them when unsaved', async () => {
    expect((await listSaved(db)).map((a) => a.id)).toEqual([articleId]);
    await updateReadingState(db, articleId, { saved: false });
    expect(await listSaved(db)).toEqual([]);
  });

  it('ignores unknown articles', async () => {
    expect(await updateReadingState(db, 999_999, { saved: true })).toBeNull();
  });
});

describe('news cycles', () => {
  it('starts 24h back on first use, then from when you said you were caught up', async () => {
    const now = new Date('2026-10-22T12:00:00Z');
    expect((await getCycleStart(db, now)).toISOString()).toBe('2026-10-21T12:00:00.000Z');
    await finishCycle(db, new Date('2026-10-22T07:40:00Z'));
    expect((await getCycleStart(db, now)).toISOString()).toBe('2026-10-22T07:40:00.000Z');
  });

  it(`never looks back more than ${MAX_CYCLE_LOOKBACK_HOURS} hours`, async () => {
    await finishCycle(db, new Date('2026-10-01T00:00:00Z'));
    const now = new Date('2026-10-22T12:00:00Z');
    expect((await getCycleStart(db, now)).toISOString()).toBe('2026-10-20T12:00:00.000Z');
  });
});
