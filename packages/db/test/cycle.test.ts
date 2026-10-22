import { describe, expect, it } from 'vitest';
import { balanceCycle, sideOf, summarizeBalance } from '../src/cycle.ts';
import type { BiasLean, FeedArticle, OwnershipType } from '../src/types.ts';

const NOW = new Date('2026-10-22T12:00:00Z');
let id = 0;
function art(source: string, lean: BiasLean, o: Partial<FeedArticle> = {}): FeedArticle {
  id++;
  return {
    id, url: `https://x.test/${id}`, title: `t${id}`, summary: 'summary', author: null, image_url: null, section: null,
    sort_at: new Date(NOW.getTime() - id * 60_000), source_slug: source, source_name: source,
    ownership_type: 'commercial' as OwnershipType, access_model: 'free', metered_limit: null, metered_period: null,
    donate_url: null, country: 'US', user_weight: 0, bias_lean: lean, bias_rater: 'AllSides', bias_overridden: false,
    reader_blocked: false, opened_at: null, saved_at: null, read_at: null, progress: 0, ...o,
  };
}
const many = (source: string, lean: BiasLean, count: number, o: Partial<FeedArticle> = {}) =>
  Array.from({ length: count }, () => art(source, lean, o));

describe('balanceCycle', () => {
  it('gives left, center, and right equal shares when supply allows', () => {
    const pool = [
      ...many('l1', 'left', 10), ...many('l2', 'lean_left', 10), ...many('l3', 'lean_left', 10),
      ...many('c1', 'center', 10), ...many('c2', 'center', 10),
      ...many('r1', 'right', 10), ...many('r2', 'lean_right', 10),
    ];
    const picks = balanceCycle(pool, { now: NOW, limit: 18 });
    const s = summarizeBalance(picks).bySide;
    expect(s).toEqual({ left: 6, center: 6, right: 6, unrated: 0 });
  });

  it('caps each outlet (boosted outlets get more) and spreads outlets out', () => {
    const pool = [...many('big', 'left', 50), ...many('boosted', 'center', 50, { user_weight: 1 }), ...many('r', 'right', 50)];
    const picks = balanceCycle(pool, { now: NOW, limit: 30, perSourceCap: 3, boostedCap: 5 });
    const per = (s: string) => picks.filter((p) => p.source_slug === s).length;
    expect(per('big')).toBe(3);
    expect(per('boosted')).toBe(5);
    expect(per('r')).toBe(3);
    // No outlet appears twice in a row at the top.
    for (let i = 1; i < 6; i++) expect(picks[i]!.source_slug).not.toBe(picks[i - 1]!.source_slug);
  });

  it('lets other sides fill in when one runs out', () => {
    const pool = [...many('a', 'left', 5), ...many('b', 'left', 5), ...many('c', 'center', 5), art('r', 'right')];
    const picks = balanceCycle(pool, { now: NOW, limit: 8 });
    expect(picks).toHaveLength(8);
    expect(picks.filter((p) => sideOf(p.bias_lean) === 'right')).toHaveLength(1);
  });

  it('never includes muted outlets', () => {
    const picks = balanceCycle([...many('muted', 'center', 5, { user_weight: -1 }), ...many('ok', 'center', 5)], { now: NOW, limit: 10 });
    expect(picks.every((p) => p.source_slug === 'ok')).toBe(true);
  });

  it('prefers fresher articles within an outlet', () => {
    const old = art('x', 'center', { sort_at: new Date(NOW.getTime() - 20 * 3600_000) });
    const fresh = art('x', 'center', { sort_at: new Date(NOW.getTime() - 5 * 60_000) });
    expect(balanceCycle([old, fresh], { now: NOW, limit: 1 })[0]!.id).toBe(fresh.id);
  });
});
